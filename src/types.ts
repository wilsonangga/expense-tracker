export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  note: string;
  source: string;
  created_at: string;
}

export interface Category {
  name: string;
  icon: string;
  color: string;
}

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
}

export interface Receipt {
  merchant: string | null;
  date: string | null;
  items: ReceiptItem[];
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
}
