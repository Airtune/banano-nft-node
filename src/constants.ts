// Settings
export const NODE_RPC_URL = 'http://127.0.0.1:7072'
// Amount of frontier IAssetBlocks to store in the database. You need a few blocks of history to continue tracing atomic swaps.
export const ASSET_BLOCK_FRONTIER_COUNT = 5;
export const CRAWL_UNDISCOVERED_CHANGE_INTERVAL = 16 * 1000; // milliseconds
export const CRAWL_KNOWN_PENDING_INTERVAL = 0.42 * 1000; // milliseconds
export const DEBUG = true;