const { ValidationError } = require('@hapi/joi');
const Docker = require('./Docker');
const Hub = require('../../../registries/providers/hub/Hub');
const Ecr = require('../../../registries/providers/ecr/Ecr');

const sampleSemver = require('../../samples/semver.json');
const sampleCoercedSemver = require('../../samples/coercedSemver.json');
const sampleNotSemver = require('../../samples/notSemver.json');

jest.mock('request-promise-native');

const docker = new Docker();

const hub = new Hub();
const ecr = new Ecr();

Docker.__set__('getRegistries', () => ({
    hub,
    ecr,
}));

const configurationValid = {
    socket: '/var/run/docker.sock',
    port: 2375,
    watchbydefault: true,
    cron: '0 * * * *',
};

test('validatedConfiguration should initialize when configuration is valid', () => {
    const validatedConfiguration = docker.validateConfiguration(configurationValid);
    expect(validatedConfiguration).toStrictEqual(configurationValid);
});

test('validatedConfiguration should initialize with default values when not provided', () => {
    const validatedConfiguration = docker.validateConfiguration({});
    expect(validatedConfiguration).toStrictEqual(configurationValid);
});

test('validatedConfiguration should failed when configuration is invalid', () => {
    expect(() => {
        docker.validateConfiguration({ watchbydefault: 'xxx' });
    }).toThrowError(ValidationError);
});

test('initTrigger should create a configured DockerApi instance', () => {
    docker.configuration = docker.validateConfiguration(configurationValid);
    docker.initTrigger();
    expect(docker.dockerApi.modem.socketPath).toBe(configurationValid.socket);
});

test('getTagsCandidate should match when current version is semver and new tag is found', () => {
    expect(Docker.__get__('getTagsCandidate')(sampleSemver, ['7.8.9'])).toEqual(['7.8.9']);
});

test('getTagsCandidate should match when current version is coerced semver and new tag is found', () => {
    expect(Docker.__get__('getTagsCandidate')(sampleCoercedSemver, ['7.8.9'])).toEqual(['7.8.9']);
});

test('getTagsCandidate should not match when current version is semver and no new tag is found', () => {
    expect(Docker.__get__('getTagsCandidate')(sampleSemver, [])).toEqual([]);
});

test('getTagsCandidate should match when newer version match the include regex', () => {
    expect(Docker.__get__('getTagsCandidate')({ ...sampleSemver, includeTags: '^[0-9]\\d*\\.[0-9]\\d*\\.[0-9]\\d*$' }, ['7.8.9'])).toEqual(['7.8.9']);
});

test('getTagsCandidate should not match when newer version but doesnt match the include regex', () => {
    expect(Docker.__get__('getTagsCandidate')({ ...sampleSemver, includeTags: '^v[0-9]\\d*\\.[0-9]\\d*\\.[0-9]\\d*$' }, ['7.8.9'])).toEqual([]);
});

test('getTagsCandidate should match when newer version doesnt match the exclude regex', () => {
    expect(Docker.__get__('getTagsCandidate')({ ...sampleSemver, excludeTags: '^v[0-9]\\d*\\.[0-9]\\d*\\.[0-9]\\d*$' }, ['7.8.9'])).toEqual(['7.8.9']);
});

test('getTagsCandidate should not match when newer version and match the exclude regex', () => {
    expect(Docker.__get__('getTagsCandidate')({ ...sampleSemver, excludeTags: '^[0-9]\\d*\\.[0-9]\\d*\\.[0-9]\\d*$' }, ['7.8.9'])).toEqual([]);
});

test('getTagsCandidate should return only greater tags than current', () => {
    expect(Docker.__get__('getTagsCandidate')(sampleSemver, ['7.8.9', '4.5.6', '1.2.3'])).toEqual(['7.8.9']);
});

test('getTagsCandidate should return all greater tags', () => {
    expect(Docker.__get__('getTagsCandidate')(sampleSemver, ['10.11.12', '7.8.9', '4.5.6', '1.2.3'])).toEqual(['10.11.12', '7.8.9']);
});

test('getTagsCandidate should return all greater tags when current tag is not a semver', () => {
    expect(Docker.__get__('getTagsCandidate')(sampleNotSemver, ['10.11.12', '7.8.9', 'notasemver', '1.2.3'])).toEqual(['10.11.12', '7.8.9']);
});

test('normalizeImage should return hub when applicable', () => {
    expect(Docker.__get__('normalizeImage')({ image: 'image' })).toStrictEqual({
        registry: 'hub',
        registryUrl: 'https://registry-1.docker.io/v2',
        image: 'library/image',
    });
});

test('normalizeImage should return ecr when applicable', () => {
    expect(Docker.__get__('normalizeImage')({
        registryUrl: '123456789.dkr.ecr.eu-west-1.amazonaws.com/test:latest',
    })).toStrictEqual({
        registry: 'ecr',
        registryUrl: 'https://123456789.dkr.ecr.eu-west-1.amazonaws.com/test:latest/v2',
    });
});

test('normalizeImage should return original image when no matching provider found', () => {
    expect(Docker.__get__('normalizeImage')({ registryUrl: 'unknown' })).toEqual({ registryUrl: 'unknown' });
});

test('findNewVersion should return new image when found', () => {
    hub.getTags = () => ({
        tags: ['7.8.9'],
    });
    expect(docker.findNewVersion(sampleSemver)).resolves.toMatchObject({
        newVersion: '7.8.9',
    });
});

test('findNewVersion should return undefined when no image found', () => {
    hub.getTags = () => ({
        tags: [],
    });
    expect(docker.findNewVersion(sampleSemver)).resolves.toBe(undefined);
});

test('mapContainerToImage should map a container definition to an image definition', async () => {
    docker.dockerApi = {
        image: {
            get: () => ({
                status: () => ({
                    data: {
                        Architecture: 'arch',
                        Os: 'os',
                        Size: '10',
                        Created: '2019-05-20T12:02:06.307Z',
                    },
                }),
            }),
        },
    };
    const container = {
        data: {
            Image: 'organization/image:version',
        },
    };

    const image = await docker.mapContainerToImage(container);
    expect(image).toMatchObject({
        registry: 'hub',
        registryUrl: 'https://registry-1.docker.io/v2',
        image: 'organization/image',
        version: 'version',
        versionDate: '2019-05-20T12:02:06.307Z',
        architecture: 'arch',
        os: 'os',
        size: '10',
        includeTags: undefined,
        excludeTags: undefined,
    });
});

test('watchImage should return new image when found', () => {
    docker.configuration = {};
    hub.getTags = () => ({
        tags: ['7.8.9'],
    });
    expect(docker.watchImage(sampleSemver)).resolves.toMatchObject({
        result: {
            newVersion: '7.8.9',
        },
    });
});

test('watchImage should return no result when no image found', () => {
    docker.configuration = {};
    hub.getTags = () => ({
        tags: [],
    });
    expect(docker.watchImage(sampleSemver)).resolves.toMatchObject({
        result: undefined,
    });
});

test('getImages should return a list of images found by the docker socket', () => {
    const image1 = {
        data: {
            Image: 'image',
            Architecture: 'arch',
            Os: 'os',
            Size: '10',
            Created: '2019-05-20T12:02:06.307Z',
            Labels: {},
        },
    };
    docker.dockerApi = {
        container: {
            list: () => ([image1]),
        },
        image: {
            get: () => ({
                status: () => (image1),
            }),
        },
    };

    docker.configuration = {
        watchbydefault: true,
    };
    expect(docker.watch()).resolves.toMatchObject([{
        registry: 'hub',
        registryUrl: 'https://registry-1.docker.io/v2',
        image: 'library/image',
        version: 'latest',
        versionDate: '2019-05-20T12:02:06.307Z',
        architecture: 'arch',
        os: 'os',
        size: '10',
        isSemver: false,
    }]);
});
