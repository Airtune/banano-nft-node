// NB: Increments mint_count
export const updateSupplyBlockNewMint = async (
  pgPool: any,
  supplyBlockId: number,
  mintCrawlAt: Date,
  mintCrawlHeight: number,
  mintCrawlHead: string,
  burned: boolean = false
) => {
  const burn_increment = burned ? 1 : 0;
  const query = `
      UPDATE supply_blocks
      SET
        mint_count = mint_count + 1,
        burn_count = burn_count + $1,
        mint_crawl_at = $2,
        mint_crawl_height = $3,
        mint_crawl_head = $4,
        updated_at = current_timestamp
      WHERE id = $5
    `;

  const values = [burn_increment, mintCrawlAt, mintCrawlHeight, mintCrawlHead, supplyBlockId];

  try {
    await pgPool.query(query, values);
    // console.log(`Updated mint crawl info for supply block with id ${supplyBlockId}`);
  } catch (error) {
    console.error(`\n\nERROR updateSupplyBlockNewMint:`);
    console.error(error);
    throw new Error(`Error updating mint crawl info: ${error.message}`);
  }
};

export const updateSupplyBlockBurn = async (
  pgPool: any,
  nft_id: number
) => {
  const query = `
      UPDATE supply_blocks
      SET
        burn_count = burn_count + 1,
        updated_at = current_timestamp
      FROM supply_blocks
      INNER JOIN nfts ON supply_blocks.id = nfts.supply_block_id AND nfts.id = $1
      LIMIT 1
    `;

  const values = [nft_id];

  try {
    await pgPool.query(query, values);
    // console.log(`Updated burn info for supply block for nft_id ${nft_id}`);
  } catch (error) {
    console.error(`\n\nERROR updateSupplyBlockBurn:`);
    console.error(error);
    throw new Error(`Error updating burn info: ${error.message}`);
  }
};
