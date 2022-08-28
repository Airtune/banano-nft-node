import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { NODE_RPC_URL } from "./constants";

const fetch = require('node-fetch');

export const bananode = new NanoNode(NODE_RPC_URL, fetch);
