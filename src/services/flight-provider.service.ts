import { FlightData, FlightProviderResponse, FlightStatus } from '../types/flight';
import { config } from '../config/config';
import { logger } from '../config/logger';

export interface IFlightProvider {
  getFlightData(flightId: string): Promise<FlightProviderResponse>;
}

/**
 * Implementación real del proveedor de vuelos
 */
export class FlightProvider implements IFlightProvider {
  async getFlightData(flightId: string): Promise<FlightProviderResponse> {
    try {
      // Aquí iría la llamada real a la API externa
      const response = await fetch(`${config.flightProvider.apiUrl}/flights/${flightId}`, {
        headers: {
          'Authorization': `Bearer ${config.flightProvider.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: this.mapToFlightData(data),
      };
    } catch (error) {
      logger.error('Error fetching flight data', { flightId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private mapToFlightData(apiData: any): FlightData {
    // Mapear la respuesta de la API externa a nuestro formato interno
    return {
      flightId: apiData.flight_id,
      airline: apiData.airline,
      flightNumber: apiData.flight_number,
      scheduledDeparture: new Date(apiData.scheduled_departure),
      origin: apiData.origin,
      destination: apiData.destination,
      status: apiData.status as FlightStatus,
      gate: apiData.gate,
      terminal: apiData.terminal,
      delay: apiData.delay_minutes || 0,
      actualDeparture: apiData.actual_departure ? new Date(apiData.actual_departure) : undefined,
      estimatedDeparture: apiData.estimated_departure ? new Date(apiData.estimated_departure) : undefined,
    };
  }
}

/**
 * Implementación mock para testing y desarrollo
 */
export class MockFlightProvider implements IFlightProvider {
  private mockData: Map<string, FlightData> = new Map();

  constructor() {
    this.initializeMockData();
  }

  async getFlightData(flightId: string): Promise<FlightProviderResponse> {
    // Simular latencia de red
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const flightData = this.mockData.get(flightId);
    if (!flightData) {
      return {
        success: false,
        error: 'Flight not found',
      };
    }

    // Simular cambios aleatorios ocasionales
    const updatedData = this.simulateRandomChanges(flightData);

    return {
      success: true,
      data: updatedData,
    };
  }

  setMockData(flightId: string, data: FlightData): void {
    this.mockData.set(flightId, data);
  }

  private initializeMockData(): void {
    // Datos de ejemplo
    this.mockData.set('AA123-2024-08-26', {
      flightId: 'AA123-2024-08-26',
      airline: 'American Airlines',
      flightNumber: 'AA123',
      scheduledDeparture: new Date('2024-08-26T10:30:00Z'),
      origin: 'JFK',
      destination: 'LAX',
      status: FlightStatus.SCHEDULED,
      gate: 'A12',
      terminal: '4',
      delay: 0,
    });
  }

  private simulateRandomChanges(originalData: FlightData): FlightData {
    const data = { ...originalData };
    const random = Math.random();

    // 5% de probabilidad de cambio de puerta
    if (random < 0.05 && data.gate) {
      const gates = ['A10', 'A11', 'A12', 'A13', 'B1', 'B2', 'B3'];
      data.gate = gates[Math.floor(Math.random() * gates.length)];
    }

    // 3% de probabilidad de retraso
    if (random < 0.03) {
      data.delay = Math.floor(Math.random() * 60) + 5; // 5-65 minutos
      if (data.delay >= 30) {
        data.status = FlightStatus.DELAYED;
      }
    }

    // 1% de probabilidad de cancelación
    if (random < 0.01) {
      data.status = FlightStatus.CANCELLED;
    }

    // 2% de probabilidad de cambio de estado a boarding
    if (random < 0.02 && data.status === FlightStatus.SCHEDULED) {
      data.status = FlightStatus.BOARDING;
    }

    return data;
  }
}

// Factory para crear el proveedor apropiado
export function createFlightProvider(): IFlightProvider {
  if (config.nodeEnv === 'test' || config.flightProvider.apiKey === '') {
    return new MockFlightProvider();
  }
  return new FlightProvider();
}
