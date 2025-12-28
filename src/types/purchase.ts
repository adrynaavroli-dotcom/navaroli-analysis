export interface ThesisPurchase {
  id: string;
  thesis_id: string;
  user_id: string;
  purchase_date: string;
  shares: number;
  price_per_share: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseSummary {
  totalShares: number;
  totalCost: number;
  averagePrice: number;
  currentValue: number;
  gainLoss: number;
  gainLossPercent: number;
}
