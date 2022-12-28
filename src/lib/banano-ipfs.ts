import { NanoIpfs } from 'nano-ipfs';
const bananojs = require("@bananocoin/bananojs");
const publicKeyToAccount = (publicKey) => {
  return bananojs.bananoUtil.getAccount(publicKey, 'ban_');
};
const accountToPublicKey = bananojs.bananoUtil.getAccountPublicKey;
export const banano_ipfs = new NanoIpfs(publicKeyToAccount, accountToPublicKey);
