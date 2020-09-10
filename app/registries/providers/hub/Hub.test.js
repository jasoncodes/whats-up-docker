const rp = require('request-promise-native');
const Hub = require('./Hub');

const hub = new Hub();
hub.configuration = {};

jest.mock('request-promise-native');

test('validatedConfiguration should initialize when configuration is valid', () => {
    expect(hub.validateConfiguration({
        login: 'login',
        token: 'token',
    })).toStrictEqual({
        login: 'login',
        token: 'token',
    });
    expect(hub.validateConfiguration({ auth: 'auth' })).toStrictEqual({ auth: 'auth' });
    expect(hub.validateConfiguration({})).toStrictEqual({});
    expect(hub.validateConfiguration(undefined)).toStrictEqual({});
});

test('validatedConfiguration should throw error when login without token', () => {
    expect(() => {
        hub.validateConfiguration({
            login: 'login',
        });
    }).toThrow('"login" is not allowed');
});

test('validatedConfiguration should throw error when token without login', () => {
    expect(() => {
        hub.validateConfiguration({
            token: 'token',
        });
    }).toThrow('"login" is required');
});

test('validatedConfiguration should throw error when login & auth at the same time', () => {
    expect(() => {
        hub.validateConfiguration({
            login: 'login',
            auth: 'auth',
        });
    }).toThrow('"login" is not allowed');
});

test('validatedConfiguration should throw error when auth is not base64', () => {
    expect(() => {
        hub.validateConfiguration({
            auth: '°°°',
        });
    }).toThrow('"auth" must be a valid base64 string');
});

test('match should return true when no registry on the image', () => {
    expect(hub.match({})).toBeTruthy();
});

test('match should return false when registry on the image', () => {
    expect(hub.match({ registryUrl: 'registry' })).toBeFalsy();
});

test('normalizeImage should prefix with library when no organization', () => {
    expect(hub.normalizeImage({
        image: 'test',
    })).toStrictEqual({
        registry: 'hub',
        registryUrl: 'https://registry-1.docker.io/v2',
        image: 'library/test',
    });
});

test('normalizeImage should not prefix with library when existing organization', () => {
    expect(hub.normalizeImage({
        image: 'myorga/test',
    })).toStrictEqual({
        registry: 'hub',
        registryUrl: 'https://registry-1.docker.io/v2',
        image: 'myorga/test',
    });
});

test('authenticate should perform authenticate request', () => {
    rp.mockImplementation(() => ({
        token: 'token',
    }));
    expect(hub.authenticate({}, {
        headers: {},
    })).resolves.toEqual({ headers: { Authorization: 'Bearer token' } });
});

test('getAuthCredentials should return base64 creds when set in configuration', () => {
    hub.configuration.auth = 'dXNlcm5hbWU6cGFzc3dvcmQ=';
    expect(hub.getAuthCredentials()).toEqual('dXNlcm5hbWU6cGFzc3dvcmQ=');
});

test('getAuthCredentials should return base64 creds when login/token set in configuration', () => {
    hub.configuration.login = 'username';
    hub.configuration.token = 'password';
    expect(hub.getAuthCredentials()).toEqual('dXNlcm5hbWU6cGFzc3dvcmQ=');
});

test('getAuthCredentials should return undefined when no login/token/auth set in configuration', () => {
    hub.configuration = {};
    expect(hub.getAuthCredentials()).toBe(undefined);
});
