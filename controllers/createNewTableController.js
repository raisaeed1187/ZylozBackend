const sql = require("mssql");
const express = require("express");
const crypto = require('crypto');
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob"); 
const fs = require("fs");

// const {constents} = require('../constents');
const {helper} = require('../helper.js');
const { setCurrentDatabase,setCurrentUser } = require('../constents').actions;
const store = require('../store'); 


const upload = multer({ dest: "uploads/" });

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);



const states = {
    currentDate : helper.methods.getCurrentDateTime(),
    createdBy :'1',
    constentStates: store.getState(), 
}


const methods = {
    createNewTable(){
        createNewTable();
    },
    getDynamicCreatedTables(req,res){
        getDynamicCreatedTables(req,res)
    }
}

const getMainModules = async (req,res)=>{
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;    
            const pool = await sql.connect(config); 
        
            // const apiResponse = await pool.request().query(`select * from DynamicCreatedTables`); 
            const apiResponse = await pool.request().query(`select * from MainModule where Active = 1 order by SortOrder asc`); 

            // res.json(apiResponse.recordset);
            res.status(200).json({
                message: 'Main modules',
                data: apiResponse.recordset
            });
             
        } catch (error) {
            console.log(error);
        }
}
const getDynamicCreatedTablesWithModules = async (req,res)=>{
    try { 
        
 
            // constents.methods.setCurrentDatabase(req.authUser.database); 
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;    
            const pool = await sql.connect(config); 

            console.log('req.authUser');
            console.log(req.authUser); 
            console.log('req.authUser.database');
            console.log(req.authUser.database);


            
            // const apiResponse = await pool.request().query(`select * from DynamicCreatedTables`); 
            const apiResponse = await pool.request().query(`exec GetDynamicCreatedScreenWithModules ${req.authUser.Id}`); 
            // res.json(apiResponse.recordset);
            const jsonResult = apiResponse.recordset[0];
            //  console.log(jsonResult);   
            const parsedResult = JSON.parse(jsonResult['JSON_F52E2B61-18A1-11d1-B105-00805F49916B']);
            // pool.close();
             
            res.status(200).json({
                message: 'Main modules with tables',
                data: parsedResult
            });
        } catch (error) {
            console.log(error);
        }
}

const getDynamicCreatedTables = async (req,res)=>{
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;    
            const pool = await sql.connect(config); 
            // const apiResponse = await pool.request().query(`select * from DynamicCreatedTables`); 
            const apiResponse = await pool.request().query(`select * from DynamicCreatedTables `); 

            res.json(apiResponse.recordset);
            // apiResponse.then((data)=>{
            //     return res.json(data.recordset);
            // }); 
        } catch (error) {
            console.log(error);
        }
}

const getModulesDynamicCreatedTables = async (req,res)=>{
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;    
            const pool = await sql.connect(config); 
            // const apiResponse = await pool.request().query(`select * from DynamicCreatedTables`); 
            const apiResponse = await pool.request().query(`select * from DynamicCreatedTables `); 

            res.json(apiResponse.recordset);
            // apiResponse.then((data)=>{
            //     return res.json(data.recordset);
            // }); 
        } catch (error) {
            console.log(error);
        }
}


 const createNewTable = async (req, res) => { 
    // console.log('req'); 
    // const {fields,tableName,module,isMainMenu} = req.body; // user data sent from client
    const parameters = req.body; // user data sent from client
    const tableName =  parameters.tableName;
    const fields =  parameters.fields; 
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser)); 
   

    // // Check if required fields are present
    if (!fields || !tableName) {
        return res.status(400).json({ message: 'Table name & minimam 1 field is required!' });
    }
    const allFields = JSON.parse(fields); 
    try {
        await createDynamicTable(tableName,allFields,parameters);
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: 'Table created/updated successfully!',
            data: allFields
        });
        
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};


async function createDynamicTable(tableName, fields,parameters) {
    // const pool = await connectToDatabase(); 
    // const pool = await sql.connect(constents.states.config);
    const config = store.getState().constents.config;    
    const pool = await sql.connect(config); 
    const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

    try {
      const apiResponse = await pool.request().query(`select * from DynamicCreatedTables where TableName = '${sanitizedTableName}'`); 
      if(apiResponse.recordset.length > 0){
        await addDynamicFieldsInExistingTable(sanitizedTableName, fields);
        const createdTableId = 0;
        await insertNewTableValueInDynamicTable(tableName,createdTableId,parameters);
        // await linkMasterWithTableColumn(tableName,fields);
        // await setTableColumnProperties(tableName,fields); 

        console.log(`Table '${sanitizedTableName}' updated successfully!`);

      }else{

            const encodedIdField = {fieldname:"ID2",fieldtype:"nvarchar(65)"} 
            fields.unshift(encodedIdField);
            const IdField = {fieldname:"ID",fieldtype:"INT IDENTITY(1,1) PRIMARY KEY"} 
            fields.unshift(IdField); 
            const createdByField = {fieldname:"CreatedBy",fieldtype:"nvarchar(250)"}  
            fields.push(createdByField);
            const createdAtField = {fieldname:"CreatedAt",fieldtype:"datetime"}  
            fields.push(createdAtField);
            const changedByField = {fieldname:"ChangedBy",fieldtype:"nvarchar(250)"}  
            fields.push(changedByField);
            const changedAtField = {fieldname:"ChangedAt",fieldtype:"datetime"}  
            fields.push(changedAtField);

            const columns = fields
            .map((field) => {
                if (field.fieldname == 'ID') {
                return  `${field.fieldname} ${field.fieldtype}`
                }else{
                    return  `${field.fieldname.replace(/[^a-zA-Z0-9_]/g, '')} ${field.fieldtype}  ${field.isRequired == 1 ? 'NOT NULL' : 'NULL'}`
                    // return  `[${field.fieldname}] ${field.fieldtype} NULL`
                }
                })
            .join(', ');
            const createTableQuery = `CREATE TABLE ${sanitizedTableName} (${columns})`;
            console.log(createTableQuery);
            await pool.request().query(createTableQuery);
            console.log('after table created');
            let createdTableId = 0;   
            // Query to get the object ID of the created table
            const getTableIdQuery = `
                SELECT OBJECT_ID('${sanitizedTableName}', 'U') AS TableId;
            `; 
            const result = await pool.request().query(getTableIdQuery);
            

            if (result.recordset.length > 0) {
                createdTableId = encryptID(result.recordset[0].TableId); 
                

                await insertNewTableValueInDynamicTable(tableName,createdTableId,parameters);
                await linkMasterWithTableColumn(tableName,fields);
                await setTableColumnProperties(tableName,fields); 
                console.log(`Table '${sanitizedTableName}' created successfully!`);
            } else {
                throw new Error('Table ID not found!');
            }
      }   
    } catch (err) {
      console.error('Error creating table:', err);
      throw new Error(err.message);
    } 
    // finally {
    //     pool.close();
    // }
}
async function addDynamicFieldsInExistingTable(tableName, fields) {  
    const config = store.getState().constents.config;    
    const pool = await sql.connect(config); 
    try {
      for (const field of fields) {
        const checkColumnQuery = `
            IF EXISTS (
                SELECT 1
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '${tableName}'
                  AND COLUMN_NAME = '${field.oldFieldName.replace(/[^a-zA-Z0-9_]/g, '')}'
            )
                SELECT 'EXISTS' AS ColumnStatus
            ELSE
                SELECT 'NOT_EXISTS' AS ColumnStatus
        `;
        // Execute the query to check column status
        const result = await pool.request().query(checkColumnQuery);
        const columnStatus = result.recordset[0].ColumnStatus;

        if (columnStatus === 'EXISTS' ) { 
            const updateColumnQuery = `ALTER TABLE ${tableName} ALTER COLUMN ${field.oldFieldName} ${field.fieldtype} ${field.isRequired == 1 ? 'NOT NULL' : 'NULL'}`;  
                // Execute the query
            const updateColumnResult = await pool.request().query(updateColumnQuery);

            if(field.oldFieldName != field.fieldname ){
                const renameColumnQuery = `EXEC sp_rename '${tableName}.${field.oldFieldName.replace(/[^a-zA-Z0-9_]/g, '')}', '${field.fieldname.replace(/[^a-zA-Z0-9_]/g, '')}', 'COLUMN'`;
                await pool.request().query(renameColumnQuery);
                
            }
            if(field.linkDynamicMaster){
                const query = `exec TableColumnMasterLink_SaveUpdate '${tableName}','${field.oldFieldName}','${field.fieldname}','${field.linkDynamicMaster}',1, '${states.createdBy}','${states.currentDate}'`;  
                // Execute the query
                const result = await pool.request().query(query);
            }
            
            // console.log(`Column '${field.oldFieldName}' renamed to '${field.fieldname}' in table '${tableName}'.`);
        }else{
            const alterTableQuery = `ALTER TABLE ${tableName} ADD ${field.fieldname.replace(/[^a-zA-Z0-9_]/g, '')} ${field.fieldtype} ${field.isRequired == 1 ? 'NOT NULL DEFAULT 0' : 'NULL'}`; 
            console.log(alterTableQuery);
            await pool.request().query(alterTableQuery);
            if(field.linkDynamicMaster){
                const query = `exec TableColumnMasterLink_SaveUpdate '${tableName}','${field.fieldname}','${field.fieldname}','${field.linkDynamicMaster}',1, '${states.createdBy}','${states.currentDate}'`;  
                // Execute the query
                const result = await pool.request().query(query);
            }
             
            // console.log(`Field '${field.fieldname}' added to table '${tableName}'`);
        }

      }//end of for loop
    } catch (err) {
      console.error('Error adding fields:', err.message);  
        // throw err;
        throw new Error(err.message);
    } 
}
async function insertNewTableValueInDynamicTable(tableName,createdTableId,parameters) { 
    const config = store.getState().constents.config;    
    const pool = await sql.connect(config); 
    const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

    const currentDate = helper.methods.getCurrentDateTime();
    const createdBy = store.getState().constents.user.username; // constents.states.user?.username;
    const module = parameters.module;
    const isMainMenu = parameters.isMainMenu; 
    try {
        // console.log('DynamicCreatedTables_Save_Update');
        // const query = `INSERT INTO DynamicCreatedTables (TableName,TableId,Module,TableTitle,IsMainMenu, CreatedBy,CreatedAt) VALUES ('${sanitizedTableName}',${createdTableId},'${module}','${tableName}',${isMainMenu}, '${createdBy}','${currentDate}')`; 
        const query = `exec DynamicCreatedTables_Save_Update '${sanitizedTableName}','${createdTableId}','${module}','${tableName}',${isMainMenu}, '${createdBy}','${currentDate}'`; 
       
        // Execute the query
        const result = await pool.request().query(query);
        console.log(`new table entery added in dynamicTable`);
    } catch (err) {
      console.error('Error adding fields:', err);
    } 
}
// end of insertNewTableValueInDynamicTable
async function linkMasterWithTableColumn(tableName,fields) { 
    const config = store.getState().constents.config;    
    const pool = await sql.connect(config); 
    const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, ''); 
    const currentDate = helper.methods.getCurrentDateTime();
    const createdBy = store.getState().constents.user.username; // constents.states.user.Id; 
    try {
        fields.forEach(async (field) => {
            if(field.linkDynamicMaster){ 
                const query = `exec TableColumnMasterLink_SaveUpdate '${sanitizedTableName}','${field.oldFieldName}','${field.fieldname}','${field.linkDynamicMaster}',1, '${createdBy}','${currentDate}'`;  
                // Execute the query
                const result = await pool.request().query(query);
            }
        });
         
        console.log(`new table entery added in dynamicTable`);
    } catch (err) {
      console.error('Error adding fields:', err);
    } 
}
// end of linkMasterWithTableColumn
async function setTableColumnProperties(tableName,fields) { 
    const config = store.getState().constents.config;    
    const pool = await sql.connect(config); 
    const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, ''); 
    const currentDate = helper.methods.getCurrentDateTime();
    const createdBy = store.getState().constents.user.username; // constents.states.user.Id; 
    try {
        fields.forEach(async (field) => {
            if(field.isForDocument){ 
                const query = `exec TableColumnProperties_SaveUpdate '${sanitizedTableName}','${field.oldFieldName}','${field.fieldname}','${field.isForDocument}', '${createdBy}','${currentDate}'`;  
                // Execute the query
                const result = await pool.request().query(query);
            }
        });
         
        console.log(`new table entery added in dynamicTable`);
    } catch (err) {
      console.error('Error adding fields:', err);
    } 
}
// end of setTableColumnProperties
 


const saveDynamicTableData = async (req, res) => { 
    // console.log('req'); 
    const {fileColumn,fields,tableName,dataId} = req.body; // user data sent from client
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser)); 
    const config = store.getState().constents.config;    
    const pool = await sql.connect(config); 
    const file = req.file;
    // const fileColumn = req.fileColumn;

    // // Check if required fields are present
    if (!fields || !tableName) {
        return res.status(400).json({ message: 'Table name & minimam 1 field is required!' });
    }
    const allFields = JSON.parse(fields); 
    // console.log(allFields);
    // console.log('file');
    // console.log(file);
    // console.log('fileColumn');
    // console.log(fileColumn);


    
    // start save func
    try { 
        if(dataId == '0' ){ 
            let columns = allFields
                .map((field) => {
                    if (field.columnName != 'ID') { 
                        return  `${field.columnName.replace(/[^a-zA-Z0-9_]/g, '')}`
                    } 
                    })
            .join(', '); 
            columns = columns.replace(",", ""); 
            let values = allFields
                .map((field) => {
                    if (field.columnName != 'ID') { 
                        return  `'${field.columnValue}'`
                    } 
                    })
            .join(', ');
            values = values.replace(",", ""); 
            
            const query = `INSERT INTO ${tableName} (${columns}) OUTPUT INSERTED.ID VALUES (${values})`;  
            const result = await pool.request().query(query); 
            let newId = result.recordset[0].ID;
            let encryptedId = encryptID(newId);
            const fileUrl = await uploadDocument(req);
            // console.log('fileUrl uploaded');
            // console.log(fileUrl);

            
            if(fileUrl){
                await pool.request()
                .query(`
                    UPDATE ${tableName} 
                    SET ID2 = '${encryptedId}',
                    ${fileColumn} =  '${fileUrl.toString()}'
                    WHERE ID = ${newId}
                `);
            }else{
                await pool.request()
                .query(`
                    UPDATE ${tableName} 
                    SET ID2 = '${encryptedId}' 
                    WHERE ID = ${newId}
                `);
            }
            res.status(200).json({
                message: 'Dynamic Table data saved successfully!',
                data: allFields
            });
        }else{
            const query = generateUpdateQuery(allFields,"ID",'ID2');  
            const result = await pool.request().query(query); 
            res.status(200).json({
                message: 'Dynamic Table data updated successfully!',
                data: allFields
            });
        }

        
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null}); 
    }
    // end save func
};
 
function encryptID(id) {
  
    const secretKey = process.env.ENCRYPT_SECRET_KEY;   
    const iv = crypto.randomBytes(16);  
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey, 'utf-8'), iv);

    let encrypted = cipher.update(id.toString(), 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + encrypted; // Return IV + Encrypted Data
}
 
const generateUpdateQuery = (metadata, primaryKey = "ID",primaryKey2 = "ID2") => { 
  const tableName = metadata[0]?.tableName;
 
  const primaryKey2Value = metadata.find((item) => item.columnName === primaryKey2)?.columnValue;

  if (!tableName || primaryKey2Value === undefined) {
    throw new Error("Table name or primary key value is missing");
  }
 
  const setClauses = metadata
    .filter((item) => item.columnName !== primaryKey && item.columnName !== primaryKey2 && item.columnName !== 'CreatedBy' && item.columnName !== 'CreatedAt' && item.columnValue !== null) 
    .map((item) => {
      const value =
        item.columnDataType === "nvarchar" || item.columnDataType === "datetime"
          ? `'${item.columnValue}'` 
          : item.columnValue;  
      return `${item.columnName} = ${value}`;
    });
 
  const updateQuery = `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${primaryKey2} = '${primaryKey2Value}';`;

  return updateQuery;
};

async function uploadDocument(req){ 
    try {
        if(req.file){
            const blobName = req.file.originalname;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            const uploadFilePath = req.file.path;
    
            // Upload file to Azure Blob Storage
            const uploadStream = fs.createReadStream(uploadFilePath);
            await blockBlobClient.uploadStream(uploadStream);
            fs.unlinkSync(uploadFilePath); // Delete local file
    
            const fileUrl = blockBlobClient.url;
            console.log('fileUrl');
            console.log(fileUrl);
            return fileUrl

        }else{
            return '';
        }
        // const pool = await sql.connect(dbConfig);
        // await pool.request()
        //     .input("fileName", sql.NVarChar, blobName)
        //     .input("fileUrl", sql.NVarChar, fileUrl)
        //     .query("INSERT INTO Documents (FileName, FileUrl) VALUES (@fileName, @fileUrl)");

        // res.status(200).json({ message: "File uploaded successfully", url: fileUrl });
    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}


 
const getTableDetailsById = async (req, res) => {  
    const {tableId, tableName} = req.body; // user data sent from client
     
    // // Check if required fields are present
    if (!tableId || !tableName) {
        return res.status(400).json({ error: 'Table name is required!' });
    } 
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        const getTableNameQuery = `select * from DynamicCreatedTables where TableId = '${tableId}'`; 
        const getTableNameResponse = await pool.request().query(getTableNameQuery); 
         
        if(getTableNameResponse.recordset.length > 0){
            const newtableName = getTableNameResponse.recordset[0].TableName;
            const query = `select * from ${newtableName}`; 
            const apiResponse = await pool.request().query(query); 
            const formatCreatedAt = (createdAt) => {
                const date = new Date(createdAt);
                return date.toLocaleDateString("en-US");
            };
            
            let formatedData = apiResponse.recordset.map(staff => ({
                ...staff,
                CreatedAt: formatCreatedAt(staff.CreatedAt),
                ChangedAt: formatCreatedAt(staff.ChangedAt), 
            })); 
            formatedData = formatedData.map(({ ID, ...rest }) => rest);

            // Return a response (do not return the whole req/res object)
            res.status(200).json({
                message: `${newtableName} loaded successfully!`,
                data: formatedData
            });
        }else{
            res.status(400).json({
                message: `${tableName} data not found!`,
                data: formatedData
            });
        }   
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};


const getSpecificTableField = async (req, res) => {  
    const {tableId, tableName,dataId} = req.body; // user data sent from client
     
    // // Check if required fields are present
    if (!tableId || !tableName) {
        return res.status(400).json({ error: 'Table name is required!' });
    } 
    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        let pool = await sql.connect(config); 
        
        const getTableNameQuery = `select * from DynamicCreatedTables where TableId = '${tableId}'`; 
        const getTableNameResponse = await pool.request().query(getTableNameQuery); 
         
        if(getTableNameResponse.recordset.length > 0){
            const newtableName = getTableNameResponse.recordset[0].TableName;
            const tableDetailsQuery = `exec GetTableDetails '${newtableName}'`; 
            pool = await sql.connect(config); 
            const tableDetailsResponse = await pool.request().query(tableDetailsQuery); 
            // console.log(tableDetailsResponse);
            if(dataId){
                 pool = await sql.connect(config); 
                const tableDataDetailsQuery = `select * from ${newtableName} where ID2 = '${dataId}'`;
                const tableDataDetailsResponse = await pool.request().query(tableDataDetailsQuery);  
                const record = tableDataDetailsResponse.recordset[0];
                // Update metadata with matching values from the data record
                tableDetailsResponse.recordset.forEach((item) => {
                  if (record.hasOwnProperty(item.columnName)) {
                    item.columnValue = record[item.columnName];
                  }
                }); 
            }  
            // Return a response (do not return the whole req/res object)
            res.status(200).json({
                message: `${tableName} fields loaded successfully!`,
                data: tableDetailsResponse.recordset
            });
        }else{
            res.status(400).json({
                message: `${tableName} screen data not found`,
                data: null
            });
        }

        
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
 


// module.exports =  methods ;
module.exports =  {uploadDocument,getDynamicCreatedTablesWithModules,createNewTable,getDynamicCreatedTables,getTableDetailsById,getSpecificTableField,saveDynamicTableData,getMainModules} ;



