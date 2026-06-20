import { create } from "zustand";
import axios from "axios";

const API_URL = "http://localhost:5005/api";

export const useMarketStore = create((set) => ({
  marketOverview: [],
  earningsCalendar: [],
  estimates: null,
  isLoadingOverview: false,
  isLoadingEarnings: false,
  isLoadingEstimates: false,
  error: null,

  fetchMarketOverview: async (filters = {}) => {
    set({ isLoadingOverview: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters.region) params.append("region", filters.region);
      if (filters.search) params.append("search", filters.search);
      if (filters.industry) params.append("industry", filters.industry);
      if (filters.minCap) params.append("cap_category", filters.minCap);

      const response = await axios.get(
        `${API_URL}/market/overview?${params.toString()}`,
      );
      set({ marketOverview: response.data, isLoadingOverview: false });
    } catch (error) {
      set({ error: error.message, isLoadingOverview: false });
    }
  },

  fetchEarningsCalendar: async () => {
    set({ isLoadingEarnings: true, error: null });
    try {
      const response = await axios.get(`${API_URL}/market/earnings`);
      set({ earningsCalendar: response.data, isLoadingEarnings: false });
    } catch (error) {
      set({ error: error.message, isLoadingEarnings: false });
    }
  },

  fetchEstimates: async (symbol) => {
    if (!symbol) return;
    set({ isLoadingEstimates: true, error: null });
    try {
      const response = await axios.get(`${API_URL}/market/estimates/${symbol}`);
      set({ estimates: response.data, isLoadingEstimates: false });
    } catch (error) {
      set({ error: error.message, isLoadingEstimates: false });
    }
  },
}));
