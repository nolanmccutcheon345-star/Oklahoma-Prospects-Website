export const TEAMS = ["5U", "7U", "8U", "9U", "10U", "11U", "12U", "13U", "14U", "15U", "16U"];
export type Player = {
  id: string;
  name: string;
  team: string;
  number: string;
  goal: number;
  story: string;
  approved: number;
  active: number;
  raised: number;
  sponsors: number;
  shares?: number;
  parent_email?: string;
  created?: string;
};
export type Contribution = {
  id: string;
  player_id: string;
  player_name: string;
  team: string;
  donor: string;
  email: string;
  amount: number;
  refunded: number;
  status: string;
  created: string;
  receipt_url?: string;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
export const examplePlayer: Player = {
  id: "example",
  name: "Your player",
  team: "13U",
  number: "",
  goal: 100000,
  story:
    "Baseball is where I learn to work hard, be a great teammate, and keep getting better. Your support helps make my season with Oklahoma Prospects possible. Thank you for being in my corner!",
  approved: 1,
  active: 1,
  raised: 0,
  sponsors: 0,
};
