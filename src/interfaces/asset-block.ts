import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";
import { TAssetBlockType } from "banano-nft-crawler/dist/types/asset-block-type";

export interface IAssetBlock {
  account:    TAccount,
  owner:      TAccount,
  locked:     boolean,
  block_hash: TBlockHash,
  state:      TAssetState,
  type:       TAssetBlockType
};
