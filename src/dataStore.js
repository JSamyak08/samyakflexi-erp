// PRODUCTION: No seed cylinder data. All cylinders come from Supabase or user input.
export const initialCylinders = [];

export const calculateUtilisation = (dispatchedQty, limit = 10000) => {
  const percentage = (dispatchedQty / limit) * 100;
  return Math.min(percentage, 100).toFixed(1);
};
