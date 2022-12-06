import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";

export interface ISupplyBlock {
  supply_block_hash: TBlockHash,
  supply_block_height: string,
  metadata_representative: TAccount,
  ipfs_cid: string,
  max_supply: string,
  version: string
}
