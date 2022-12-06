import { TAccount } from "nano-account-crawler/dist/nano-interfaces";

export const createSupplyBlockAndFirstNFTMint = async (pgClient: any, metadata_representative: TAccount, issuer_id: number, max_supply: (null | number)) => {
  try {
    await pgClient.query('BEGIN');
    const supplyBlockRes = await pgClient.query(
      `INSERT INTO supply_blocks(metadata_representative, issuer_id, max_supply, mint_count) VALUES ($1, $2, $3) RETURNING id;`,
      [metadata_representative, issuer_id, max_supply]
    ).catch((error) => { throw(error); });

    let supply_block_id;
    if (typeof(supplyBlockRes) !== 'undefined' && supplyBlockRes.rows[0]) {
      supply_block_id = supplyBlockRes.rows[0]["id"];
    }


    const assetBlockRes = await pgClient.query(
      `INSERT INTO nfts(asset_representative, owner_id, account_id, supply_block_id, mint_number) VALUES ($1, $2, $3, $4, 1, $5, $6) RETURNING id;`,
      [asset_representative, owner_id, account_id, supply_block_id, mint_block_hash, mint_block_height]
    );
    await pgClient.query('COMMIT');
  } catch (error) {
    await pgClient.query('ROLLBACK');
    throw(error);
  }
}