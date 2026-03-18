import { BadRequestException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('should format HttpException responses', () => {
    const exception = new BadRequestException('Invalid payload');
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    const host: any = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ requestId: 'req-1' }),
      }),
    };

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        errorCode: 'BAD_REQUEST',
        requestId: 'req-1',
      }),
    );
  });

  it('should map unknown errors to 500', () => {
    const exception = new Error('boom');
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    const host: any = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ requestId: 'req-2' }),
      }),
    };

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        requestId: 'req-2',
      }),
    );
  });
});
