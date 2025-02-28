import axios from 'axios';

// Set a key-value pair with optional TTL
async function setKey(key: string, value: any, ttl?: number) {
  try {
    const response = await axios.post('http://localhost:3001/set', { key, value, ttl });
    console.log(response.data);
  } catch (error) {
    console.error('Error setting key:', error);
  }
}

// Get a key with value and TTL
async function getKey(key: string) {
  try {
    const response = await axios.get(`http://localhost:3001/get/${key}`);
    console.log('Key data:', response.data);
  } catch (error) {
    console.error('Error fetching key:', error);
  }
}

// Delete a key
async function deleteKey(key: string) {
  try {
    const response = await axios.delete(`http://localhost:3001/del/${key}`);
    console.log(response.data);
  } catch (error) {
    console.error('Error deleting key:', error);
  }
}

// Fetch all keys with "jack" in their names and count them
async function getAllKeysWithJack() {
  try {
    const response = await axios.get('http://localhost:3002/keys');
    const keys = response.data;

    // Filter keys that contain 'jack' in their key names
    const jackKeys = keys.filter((item: { key: string, value: any }) => item.key.includes('allexander'));
    console.log('Keys with "jack":', jackKeys);

    // Return the count of such keys
    return jackKeys.length;
  } catch (error) {
    console.error('Error fetching keys:', error);
  }
}


//deleteKey('jack')

//Fetch all keys with "jack" and count them
getAllKeysWithJack().then(count => {
  console.log(`Number of keys with 'jack': ${count}`);
});

