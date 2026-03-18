import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('should attach requestId and set response header', () => {
    const middleware = new RequestIdMiddleware();
    const req: any = {};
    const setHeader = jest.fn();
    const res: any = { setHeader };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });
});
