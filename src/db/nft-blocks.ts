import type { IStatusReturn, IErrorReturn, IOkReturn } from "nano-account-crawler/dist/status-return-interfaces";

// Find the NFT block with the highest nft_block_height
export const findFrontierNFTBlock = async (pgPool: any, nft_id: number) => {
  const query = `
    SELECT *
    FROM nft_blocks
    WHERE nft_id = $1
    ORDER BY nft_block_height DESC
    LIMIT 1;
  `;
  
  const values = [nft_id];

  // TODO: Handle errors with try/catch
  const { rows } = await pgPool.query(query, values);

  return rows.length > 0 ? rows[0] : null;
};

// TODO: Return IStatusReturn
// Returns an array of rows for nft_blocks with the last element being the nft_block with the highest nft_block_height
export const findFrontierNFTBlocks = async (pgPool: any, nft_id: number, count: number): Promise<IStatusReturn<any[]>> => {
  try {
    const query = `
      SELECT *
      FROM nft_blocks
      WHERE nft_id = $1
      ORDER BY nft_block_height DESC
      LIMIT $2;
    `;

    const values = [nft_id, count];

    // TODO: Handle errors with try/catch
    const { rows } = await pgPool.query(query, values);

    // If rows are empty, return an error status
    if (!rows || rows.length === 0) {
      const errorResponse: IErrorReturn = {
        status: 'error',
        error_type: 'NoDataFound',
        message: 'No NFT blocks found for the given criteria.',
      };
      return errorResponse;
    }

    // If rows are not empty, return an OK status with the rows as value
    const okResponse: IOkReturn<any[]> = {
      status: 'ok',
      value: rows.reverse(),
    };
    return okResponse;
  } catch (error) {
    // Handle any errors that occurred during the database query
    const errorResponse: IErrorReturn = {
      status: 'error',
      error_type: 'DatabaseError',
      message: error.message,
    };
    return errorResponse;
  }
};
