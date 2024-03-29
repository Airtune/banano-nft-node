import { TAccount } from "nano-account-crawler/dist/nano-interfaces";

const issuers: TAccount[] = [
  "ban_1rp1aceaawpub5zyztzs4tn7gcugm5bc3o6oga16bb18bquqm1bjnoomynze",
  "ban_3pnftpao6pbekmear374478f1ytmwz3kodcjuzf1hutcnb3gudwi9qcu8pwc",
  "ban_1akukyw6enjwr4ptwaojnmiur5xpixo7t9gdxgs7i1w5pqjqp9f7z9u3t48n",
  "ban_1akutedg199khq5ujhy8a9yaywhwigihja8baoqn6pwjpquiejrkcdpoo1yx",
  "ban_3ns5scoro196q84698ywgnxkip4zoukiykqxrnobbzof8n43cjrh5s1o3kpx",
  "ban_3resg7ui17io531cs74k7psbsfr91ozuxp4ntxhhzgzb59diqsr54aph8b3a",
  "ban_3b4n91yt6ohpx8tf5qbqsp15mn6odqz5t7un9e7f5kcaz3atu77qha98g67j",
  "ban_1j5766ke4cefowk4w3n8gimcgh8jjrbrypmo1bqgorxrmyitbggk38dzskm9",
  "ban_1nord7w3om8uy6yzdjs3izm4tbzrxx4mumysf7wautsmfidtph4531h6737g",
  "ban_1tixkw3trrrbsrpcsmeendfpjy9rssqu7b5naqmixpmrgcaf8nfakupxi9a8",
  "ban_3aijf9scicxc4jjikdb9hbcjp8qr5m1tjjtqpn8e1cdwppq3u14mrwj7c4eb",
  "ban_1swapxh34bjstbc8c5tonbncw5nrc6sgk7h71bxtetty3huiqcj6mja9rxjt",
  "ban_3rjkg7cej8mgorzbq1wdr6upn1ibubpbnt584yhpijr3kq9joi9pmxyeuwtz",
  "ban_3txnc8y3za46hbguisj44cci8ja1pckryobj1wgb5t816g8yy6ojxibcr1ka",
  "ban_1bdaynbz85gw3tzzqh991kjegcetsjakjjg7wefee8r9jciiihk3gy76fpim"
];

// TODO: Make a db request so the list of issuers is dynamic.
export const get_issuers = async(): Promise<TAccount[]> => {
  return issuers;
}
