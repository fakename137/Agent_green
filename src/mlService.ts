import axios from 'axios';

type ModelType = 'attention' | 'cnn' | 'lstm';
type TokenType = 'btc' | 'eth';

interface PredictionRequest {
  token: TokenType;
  model_type: ModelType;
  data: Array<Record<string, number>>;
  window_size?: number;
}

export class MLService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get prediction from the ML service
   */
  async predict(
    token: TokenType,
    modelType: ModelType = 'attention', // Default to attention model
    data: Array<Record<string, number>>,
    windowSize: number = 20
  ) {
    try {
      const response = await axios.post(`${this.baseUrl}/predict`, {
        token,
        model_type: modelType,
        data,
        window_size: windowSize,
      }, {
        timeout: 10000, // 10 second timeout
      });
      
      if (!response.data || !response.data.predictions) {
        throw new Error('Invalid response from ML service');
      }
      
      return response.data;
    } catch (error) {
      console.error('Error making prediction:', error);
      // Return a neutral prediction on error
      return {
        predictions: [0],
        reason: 'Error getting prediction from ML service'
      };
    }
  }

  /**
   * Get predictions for multiple time steps
   */
  async getPredictions(
    token: TokenType,
    modelType: ModelType,
    historicalData: Array<Record<string, number>>,
    windowSize: number = 20,
    steps: number = 1
  ) {
    try {
      const response = await axios.post(`${this.baseUrl}/predict_sequence`, {
        token,
        model_type: modelType,
        data: historicalData,
        window_size: windowSize,
        steps,
      });
      return response.data;
    } catch (error) {
      console.error('Error getting predictions:', error);
      throw error;
    }
  }
}

// Singleton instance
export const mlService = new MLService();
