import { FlightData, FlightProviderResponse, FlightStatus } from '../types/flight';
import { config } from '../config/config';
import { logger } from '../config/logger';

export interface IFlightProvider {
  getFlightData(flightId: string): Promise<FlightProviderResponse>;
}

/**
 * Implementación real del proveedor de vuelos usando FlightAware
 */
export class FlightProvider implements IFlightProvider {
  async getFlightData(flightId: string): Promise<FlightProviderResponse> {
    try {
      // Parse flightId: format expected is "FLIGHT_NUMBER-YYYY-MM-DD"
      const [flightNumber, dateStr] = flightId.split('-').slice(0, 2);
      if (!flightNumber || !dateStr) {
        throw new Error('Invalid flightId format. Expected: FLIGHT_NUMBER-YYYY-MM-DD');
      }

      // FlightAware flights/search endpoint
      const url = new URL(`${config.flightProvider.apiUrl}/flights/search`);
      url.searchParams.set('query', flightNumber);
      url.searchParams.set('start', dateStr);
      url.searchParams.set('end', dateStr);
      url.searchParams.set('max_pages', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'x-apikey': config.flightProvider.apiKey,
          'Accept': 'application/json',
          'User-Agent': 'cuaderno-donde-pise/1.0'
        },
      });

      if (!response.ok) {
        throw new Error(`FlightAware API HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.flights || data.flights.length === 0) {
        return {
          success: false,
          error: 'Flight not found',
        };
      }

      // Take the first flight result
      const flight = data.flights[0];
      
      return {
        success: true,
        data: this.mapFlightAwareToFlightData(flight, flightId),
      };
    } catch (error) {
      logger.error('Error fetching flight data from FlightAware', { flightId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private mapFlightAwareToFlightData(flightAwareData: any, flightId: string): FlightData {
    // Map FlightAware API response to our internal FlightData format
    const scheduledDeparture = new Date(flightAwareData.scheduled_out || flightAwareData.estimated_out);
    const estimatedDeparture = flightAwareData.estimated_out ? new Date(flightAwareData.estimated_out) : undefined;
    const actualDeparture = flightAwareData.actual_out ? new Date(flightAwareData.actual_out) : undefined;

    // Determine status based on FlightAware status
    let status = FlightStatus.SCHEDULED;
    if (flightAwareData.status) {
      const statusLower = flightAwareData.status.toLowerCase();
      if (statusLower.includes('cancelled')) {
        status = FlightStatus.CANCELLED;
      } else if (statusLower.includes('departed')) {
        status = FlightStatus.DEPARTED;
      } else if (statusLower.includes('boarding')) {
        status = FlightStatus.BOARDING;
      } else if (statusLower.includes('delayed')) {
        status = FlightStatus.DELAYED;
      } else if (statusLower.includes('arrived')) {
        status = FlightStatus.ARRIVED;
      }
    }

    // Calculate delay in minutes
    let delay = 0;
    if (flightAwareData.departure_delay && flightAwareData.departure_delay > 0) {
      delay = Math.floor(flightAwareData.departure_delay / 60); // Convert seconds to minutes
    }

    return {
      flightId,
      airline: flightAwareData.operator || 'Unknown',
      flightNumber: flightAwareData.ident_iata || flightAwareData.ident || flightId.split('-')[0],
      scheduledDeparture,
      origin: flightAwareData.origin?.code_iata || flightAwareData.origin?.code_icao || 'Unknown',
      destination: flightAwareData.destination?.code_iata || flightAwareData.destination?.code_icao || 'Unknown',
      status,
      gate: flightAwareData.gate_origin,
      terminal: flightAwareData.terminal_origin,
      delay,
      actualDeparture,
      estimatedDeparture,
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
