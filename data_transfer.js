const mysql = require('mysql');

const readConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'datatest'
};

const writeConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'sensor_db1'
};

const readConnection = mysql.createConnection(readConfig);
const writeConnection = mysql.createConnection(writeConfig);

readConnection.connect((err) => {
    if (err) {
        console.error('Error connecting to datatest database: ' + err.stack);
        return;
    }
    console.log('Connected to datatest database as id ' + readConnection.threadId);
});

writeConnection.connect((err) => {
    if (err) {
        console.error('Error connecting to sensor_db1 database: ' + err.stack);
        return;
    }
    console.log('Connected to sensor_db1 database as id ' + writeConnection.threadId);
});

function fetchLatestData(callback) {
    const query = `
        SELECT EquipmentNo, OutlineX, OutlineY, Pattern1X, Pattern1Y, Pattern2X, Pattern2Y,
               Thickness, OutlineXYLCL, OutlineXYUCL, PatternXYLCL, PatternXYUCL, ThicknessLCL, ThicknessUCL
        FROM dimensioncci
        ORDER BY No DESC
        LIMIT 1`;

    readConnection.query(query, (error, results, fields) => {
        if (error) {
            callback(error, null);
            return;
        }
        callback(null, results[0]);
    });
}

function insertDataIntoDHT11(data, callback) {
  const { EquipmentNo, OutlineX, OutlineY, Pattern1X, Pattern1Y, Pattern2X, Pattern2Y,
          Thickness, OutlineXYLCL, OutlineXYUCL, PatternXYLCL, PatternXYUCL, ThicknessLCL, ThicknessUCL } = data;

  const query = `
      INSERT INTO dht11 (EquipmentNo, parameter, value, ucl, lcl)
      VALUES (?, ?, ?, ?, ?)`;

  const parameters = [
      [OutlineX, 'OutlineX', OutlineXYUCL, OutlineXYLCL],
      [OutlineY, 'OutlineY', OutlineXYUCL, OutlineXYLCL], 
      [Pattern1X, 'Pattern1X', PatternXYUCL, PatternXYLCL],
      [Pattern1Y, 'Pattern1Y', PatternXYUCL, PatternXYLCL], 
      [Pattern2X, 'Pattern2X', PatternXYUCL, PatternXYLCL], 
      [Pattern2Y, 'Pattern2Y', PatternXYUCL, PatternXYLCL],
      [Thickness, 'Thickness', ThicknessUCL, ThicknessLCL]
  ];

  writeConnection.beginTransaction((err) => {
      if (err) { 
          callback(err);
          return;
      }
      function executeQuery(index) {
          if (index >= parameters.length) {
              writeConnection.commit((error) => {
                  if (error) {
                      writeConnection.rollback(() => callback(error));
                  } else {
                      callback(null);
                  }
              });
              return;
          }

          const param = parameters[index];
          const ucl = param[2] !== null ? param[2] : '';
          const lcl = param[3] !== null ? param[3] : ''; 

          writeConnection.query(query, [EquipmentNo, param[1], param[0], ucl, lcl], (error, result) => {
              if (error) {
                  writeConnection.rollback(() => callback(error));
                  return;
              }
              console.log(`Inserted data with EquipmentNo ${EquipmentNo}, parameter ${param[1]}, value ${param[0]}, ucl ${ucl}, lcl ${lcl}.`);
              
              executeQuery(index + 1);
          });
      }
      executeQuery(0);
  });
}

setInterval(() => {
    fetchLatestData((error, data) => {
        if (error) {
            console.error('Error fetching data: ' + error);
            return;
        }
        insertDataIntoDHT11(data, (error) => {
            if (error) {
                console.error('Error inserting data: ' + error);
            } else {
                console.log('Data inserted successfully.');
            }
        });
    });
}, 3000);
