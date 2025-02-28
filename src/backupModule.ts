import express from 'express';
import { SimpleRedis } from './General/SimpleClass'; 
import fs from 'fs';
import path from 'path';

const backupNode = new SimpleRedis();
const app = express();
app.use(express.json()); // Ensure that Express can parse JSON bodies

// File paths for RDB and AOF backups
const RDB_FILE_PATH = path.join(__dirname, 'backup_dump.rdb');
const AOF_FILE_PATH = path.join(__dirname, 'backup_appendonly.aof');

// Function to save RDB (Redis Snapshot) to a file
function saveRDB() {
  const dataToSave: any = {};
  
  // Assuming backupNode is an instance of SimpleRedis:
  const store = backupNode.getStore();
  
  for (const [key, value] of store.entries()) {
    const ttl = backupNode.getTTL(key); // Use the new getTTL method
    dataToSave[key] = { value, ttl };
  }

  fs.writeFileSync(RDB_FILE_PATH, JSON.stringify(dataToSave));
  console.log('RDB snapshot saved');
}


// Function to append to AOF (Append-Only File)
function saveAOF(command: string) {
  fs.appendFileSync(AOF_FILE_PATH, `${command}\n`);
  console.log('AOF command saved');
}

// Sync endpoint to receive data from the store node
app.post('/sync', (req, res) => {
  try {
    const { command, key, value } = req.body;
    
    // Log the incoming request body to help with debugging
    console.log('Received data:', req.body);
    
    if (!command || !key) {
      return res.status(400).json({ status: 'Error', message: 'Missing command or key in request body' });
    }

    // Process command
    if (command === 'SET') {
      backupNode.set(key, value); // Store data in backup node
      saveAOF(`SET ${key} ${value}`); // Save SET command to AOF file
    } else if (command === 'DEL') {
      backupNode.del(key); // Delete data in backup node
      saveAOF(`DEL ${key}`); // Save DEL command to AOF file
    }

    saveRDB(); // Backup data to RDB file after sync
    res.json({ status: 'Synced' });

  } catch (error) {
    console.error('Error syncing data:', error);
    res.status(500).json({ status: 'Error', message: 'Failed to sync data' });
  }
});

// Endpoint to get key-value with TTL
app.get('/get/:key', async (req, res) => {
  const key = req.params.key;

  try {
    const result = backupNode.getWithTTL(key);

    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ status: 'Error', message: 'Key not found or expired' });
    }
  } catch (error) {
    console.error('Error fetching data from the main node:', error);
    res.status(500).json({ status: 'Error', message: 'Failed to fetch data from main node' });
  }
});

// Endpoint to get all keys with their TTLs
app.get('/keys', async (req, res) => {
  try {
    const store = backupNode.getStore();
    const keysWithTTL: { key: string; value: any; ttl: number | null }[] = [];
    store.forEach((value, key) => {
      const ttl = backupNode.getTTL(key);
      keysWithTTL.push({ key, value, ttl });
    });

    res.status(200).json(keysWithTTL);
  } catch (error) {
    console.error('Error fetching all keys:', error);
    res.status(500).json({ status: 'Error', message: 'Failed to fetch all keys' });
  }
});

// Server listening for incoming sync requests
app.listen(3002, () => {
  console.log('Backup node running on http://localhost:3002');
});
