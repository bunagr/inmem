import axios from 'axios';

async function setKey(key: string, value: any, ttl?: number) {
  try {
    const response = await axios.post('http://localhost:3001/set', { key, value, ttl });
    console.log(`Key set successfully: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.error('Error setting key:', error);
  }
}


setKey('allexander', 'allexander');
