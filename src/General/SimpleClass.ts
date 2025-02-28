import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Path to store RDB and AOF files
const RDB_FILE_PATH = path.join(__dirname, 'dump.rdb');
const AOF_FILE_PATH = path.join(__dirname, 'appendonly.aof');

// SimpleRedis class with advanced features
export class SimpleRedis {
  private store: Map<string, any> = new Map();
  private ttlStore: Map<string, number | null> = new Map(); // null represents no expiration
  private lockStore: Map<string, boolean> = new Map();
  private defaultTTL: number | null = null; // Default TTL is null (no expiration)

  private snapshotInterval: number = 60 * 1000; // Save RDB every minute
  private nodes: string[] = []; // List of other node IPs for communication

  constructor() {
    this.loadAOF();
    this.loadRDB();
    this.cleanupExpiredKeys();
    this.startRDBSnapshot();
  }

  // Load data from AOF (Append-Only File)
  private loadAOF() {
    if (fs.existsSync(AOF_FILE_PATH)) {
      const aofData = fs.readFileSync(AOF_FILE_PATH, 'utf-8');
      const commands = aofData.split('\n').filter(Boolean);
      for (const command of commands) {
        this.executeCommandFromAOF(command);
      }
      console.log('AOF data loaded');
    }
  }

  // Execute command from AOF (Append-Only File)
  private executeCommandFromAOF(command: string) {
    const [cmd, ...args] = command.split(' ');
    if (cmd === 'SET') {
      this.set(args[0], args[1]);
    } else if (cmd === 'DEL') {
      this.del(args[0]);
    }
  }

  // Load data from RDB (Redis Database Snapshot)
  private loadRDB() {
    if (fs.existsSync(RDB_FILE_PATH)) {
      const rdbData = fs.readFileSync(RDB_FILE_PATH, 'utf-8');
      const parsedData = JSON.parse(rdbData);
      for (const [key, value] of Object.entries(parsedData)) {
        this.store.set(key, value.value);
        this.ttlStore.set(key, value.ttl);
      }
      console.log('RDB data loaded');
    }
  }

  // Periodically save RDB snapshots
  private startRDBSnapshot() {
    setInterval(() => {
      this.saveRDB();
    }, this.snapshotInterval);
  }

  // Save the current state to RDB (Snapshot)
  private saveRDB() {
    const dataToSave: any = {};
    for (const [key, value] of this.store.entries()) {
      dataToSave[key] = { value, ttl: this.ttlStore.get(key) };
    }
    fs.writeFileSync(RDB_FILE_PATH, JSON.stringify(dataToSave));
    console.log('RDB snapshot saved');
  }

  // Save AOF data (Append-Only File)
  private saveAOF(command: string) {
    fs.appendFileSync(AOF_FILE_PATH, `${command}\n`);
  }

  // Set key-value pair with optional TTL
  set(key: string, value: any, ttl: number | null = this.defaultTTL) {
    if (this.lockStore.has(key) && this.lockStore.get(key)) {
      console.log(`Key "${key}" is locked for modification.`);
      return;
    }

    this.store.set(key, value);

    // If no TTL is specified (or null), store as permanent key
    const expirationTime = ttl !== null ? Date.now() + ttl * 1000 : null;
    this.ttlStore.set(key, expirationTime);

    console.log(`SET ${key}: ${value}`);
    this.saveAOF(`SET ${key} ${value}`);
    
    // Sync with other nodes
    this.syncWithNodes('SET', key, value);
  }

  // Get value by key
  get(key: string): any {
    if (this.isExpired(key)) {
      this.del(key);
      return null;
    }
    return this.store.get(key);
  }

  // Get value and TTL for a key
  getWithTTL(key: string): { value: any, ttl: number | null } | null {
    if (this.isExpired(key)) {
      this.del(key);
      return null;
    }
    const value = this.store.get(key);
    const ttl = this.ttlStore.get(key);
    return { value, ttl };
  }

  // Delete key
  del(key: string): void {
    if (this.lockStore.has(key) && this.lockStore.get(key)) {
      console.log(`Key "${key}" is locked for deletion.`);
      return;
    }

    this.store.delete(key);
    this.ttlStore.delete(key);

    console.log(`DEL ${key}`);
    this.saveAOF(`DEL ${key}`);
    
    // Sync with other nodes
    this.syncWithNodes('DEL', key);
  }

  // Check if key has expired (only if TTL is set)
  private isExpired(key: string): boolean {
    const ttl = this.ttlStore.get(key);
    if (ttl === null) {
      return false; // Key does not expire
    }
    return ttl && Date.now() > ttl;
  }

  // Clean up expired keys in the background
  private cleanupExpiredKeys() {
    setInterval(() => {
      for (const [key] of this.store) {
        if (this.isExpired(key)) {
          this.del(key);
        }
      }
    }, 10000); // Run cleanup every 10 seconds
  }

  // Lock key to prevent concurrent access
  lock(key: string): boolean {
    if (this.lockStore.has(key) && this.lockStore.get(key)) {
      console.log(`Key "${key}" is already locked.`);
      return false;
    }
    this.lockStore.set(key, true);
    return true;
  }

  // Unlock key
  unlock(key: string): void {
    this.lockStore.delete(key);
  }

  // Synchronize with other nodes
  private syncWithNodes(command: string, key: string, value?: any) {
    for (const nodeUrl of this.nodes) {
      axios.post(`${nodeUrl}/sync`, { command, key, value })
        .catch(err => console.log(`Failed to sync with node ${nodeUrl}:`, err));
    }
  }

  // Add new node to the list
  addNode(nodeUrl: string) {
    this.nodes.push(nodeUrl);
    console.log(`Node ${nodeUrl} added to the cluster.`);
  }

  // Get the entire store (for debugging or backup purposes)
  getStore(): Map<string, any> {
    return this.store;
  }

  getTTL(key: string): number | null {
    return this.ttlStore.get(key) ?? null; // Return TTL or null if not set
  }
}
