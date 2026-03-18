import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { FxService } from './fx.service';

jest.mock('axios');

describe('FxService', () => {
  let service: FxService;

  beforeEach(() => {
    service = new FxService();
    jest.clearAllMocks();
  });

  it('should return 1 for same currency conversion', async () => {
    const result = await service.getRate('NGN', 'NGN');

    expect(result.rate).toBe(1);
    expect(result.from).toBe('NGN');
    expect(result.to).toBe('NGN');
    expect(result.source).toBe('api');
  });

  it('should throw for unsupported currency pair', async () => {
    await expect(service.getRate('XYZ', 'USD')).rejects.toThrow(BadRequestException);
  });

  it('should return cached rate on second call without hitting API again', async () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockResolvedValue({
      data: {
        rates: {
          USD: 0.00065,
        },
      },
    } as never);

    const first = await service.getRate('NGN', 'USD');
    const second = await service.getRate('NGN', 'USD');

    expect(first.source).toBe('api');
    expect(second.source).toBe('cache');
    expect(second.rate).toBe(first.rate);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should retry and throw service unavailable after API failures', async () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

    await expect(service.getRate('NGN', 'USD')).rejects.toThrow(ServiceUnavailableException);
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });

  it('should fetch rates for all supported pairs in getAllRates', async () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockResolvedValue({
      data: {
        rates: {
          USD: 0.00065,
          EUR: 0.00058,
          GBP: 0.00050,
          CAD: 0.00089,
          AUD: 0.00097,
          JPY: 0.095,
        },
      },
    } as never);

    const result = await service.getAllRates('NGN');

    expect(result.length).toBe(6);
    expect(result.some((x) => x.to === 'USD')).toBe(true);
  });
});
