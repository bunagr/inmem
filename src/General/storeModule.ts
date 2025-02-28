import express from 'express';
import axios from 'axios';
import { SimpleRedis } from './SimpleClass'; // Import SimpleRedis class

const storeNode = new SimpleRedis();
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Endpoint to set key-value with optional TTL
app.post('/set', async (req, res) => {
  const { key, value, ttl } = req.body;

  // Validate input
  if (!key || !value) {
    return res.status(400).json({ status: 'Error', message: 'Key and value are required' });
  }

  try {
    // Set data in the main store node
    storeNode.set(key, value, ttl);

    // Sync with the backup node
    try {
      await axios.post('http://localhost:3002/sync', { command: 'SET', key, value, ttl });
      res.json({ status: 'OK', message: 'Data stored and backed up' });
    } catch (syncError) {
      console.log('Failed to sync with backup node:', syncError);
      res.status(500).json({ status: 'Error', message: 'Failed to sync with backup node' });
    }
  } catch (error) {
    console.error('Error storing data in the main node:', error);
    res.status(500).json({ status: 'Error', message: 'Failed to store data in main node' });
  }
});

// Endpoint to get key-value with TTL
app.get('/get/:key', async (req, res) => {
  const key = req.params.key;

  try {
    const result = storeNode.getWithTTL(key);

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

// Endpoint to delete a key
app.delete('/del/:key', async (req, res) => {
  const key = req.params.key;

  try {
    const store = storeNode.getStore();
    const keysToDelete: string[] = [];

    // Check of het een exacte match is of een patroon
    if (store.has(key)) {
      keysToDelete.push(key); // Exacte match
    } else {
      // Zoek alle keys die het patroon bevatten
      store.forEach((_, storeKey) => {
        if (storeKey.includes(key)) {
          keysToDelete.push(storeKey);
        }
      });
    }

    if (keysToDelete.length === 0) {
      return res.status(404).json({ status: 'Error', message: 'No matching keys found' });
    }

    // Verwijder alle gevonden keys
    keysToDelete.forEach((delKey) => storeNode.del(delKey));

    // Sync deleties met backup node
    await Promise.all(
      keysToDelete.map((delKey) =>
        axios.post('http://localhost:3002/sync', { command: 'DEL', key: delKey }).catch((err) => {
          console.warn(`Failed to sync deletion for key: ${delKey}`, err);
        })
      )
    );

    res.status(200).json({ status: 'OK', message: `Deleted keys: ${keysToDelete.join(', ')}` });
  } catch (error) {
    console.error('Error deleting keys:', error);
    res.status(500).json({ status: 'Error', message: 'Failed to delete keys' });
  }
});


// Endpoint to get all keys with their TTLs
app.get('/keys', async (req, res) => {
  try {
    const store = storeNode.getStore();
    const keysWithTTL: { key: string; value: any; ttl: number | null }[] = [];
    store.forEach((value, key) => {
      const ttl = storeNode.getTTL(key);
      keysWithTTL.push({ key, value, ttl });
    });

    res.status(200).json(keysWithTTL);
  } catch (error) {
    console.error('Error fetching all keys:', error);
    res.status(500).json({ status: 'Error', message: 'Failed to fetch all keys' });
  }
});

// Start the Express server
app.listen(3001, () => {
  console.log('Store node running on http://localhost:3001');
});
