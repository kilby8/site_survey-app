import request from 'supertest';
import app from '../index';
import { pool } from '../database';

// Clean up test surveys after each test
const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length > 0) {
    await pool.query('DELETE FROM surveys WHERE id = ANY($1)', [createdIds]);
  }
  await pool.end();
});

// ----------------------------------------------------------------
// Health
// ----------------------------------------------------------------
describe('GET /api/health', () => {
  it('returns status ok with database connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ----------------------------------------------------------------
// Categories
// ----------------------------------------------------------------
describe('GET /api/categories', () => {
  it('returns seeded categories', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(6);
    const names = res.body.categories.map((c: { name: string }) => c.name);
    expect(names).toContain('Electrical');
    expect(names).toContain('Safety');
  });
});

// ----------------------------------------------------------------
// Surveys CRUD
// ----------------------------------------------------------------
describe('POST /api/surveys', () => {
  it('creates a survey with checklist and returns 201', async () => {
    const payload = {
      project_name:   'Test Project Alpha',
      inspector_name: 'Jane Inspector',
      site_name:      'Test Site 1',
      site_address:   '123 Test Street',
      latitude:       51.5074,
      longitude:      -0.1278,
      gps_accuracy:   5.0,
      notes:          'Integration test survey',
      status:         'draft',
      checklist: [
        { label: 'Site Access',       status: 'pass',    notes: 'OK' },
        { label: 'Power Supply',      status: 'fail',    notes: 'No power' },
        { label: 'Safety Compliance', status: 'pending', notes: '' },
      ],
    };

    const res = await request(app)
      .post('/api/surveys')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.project_name).toBe('Test Project Alpha');
    expect(res.body.inspector_name).toBe('Jane Inspector');
    expect(res.body.latitude).toBeCloseTo(51.5074);
    expect(res.body.longitude).toBeCloseTo(-0.1278);
    expect(Array.isArray(res.body.checklist)).toBe(true);
    expect(res.body.checklist.length).toBe(3);
    expect(res.body.checklist[0].label).toBe('Site Access');
    expect(res.body.checklist[1].status).toBe('fail');

    createdIds.push(res.body.id);
  });

  it('saves and returns solar Ground Mount metadata', async () => {
    const payload = {
      project_name:   'Solar Farm Alpha',
      inspector_name: 'Bob Solar',
      site_name:      'Field B - South',
      category_name:  'Ground Mount',
      latitude:       40.7128,
      longitude:      -74.0060,
      status:         'draft',
      metadata: {
        type:                'ground_mount',
        soil_type:           'Clay',
        slope_degrees:       3.5,
        trenching_path:      'Avoid irrigation pipes near NW corner',
        vegetation_clearing: true,
      },
    };

    const res = await request(app)
      .post('/api/surveys')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.metadata).toBeDefined();
    expect(res.body.metadata.type).toBe('ground_mount');
    expect(res.body.metadata.soil_type).toBe('Clay');
    expect(res.body.metadata.slope_degrees).toBe(3.5);
    expect(res.body.metadata.vegetation_clearing).toBe(true);
    createdIds.push(res.body.id);
  });

  it('saves and returns Roof Mount metadata', async () => {
    const payload = {
      project_name:   'Residential Roof Project',
      inspector_name: 'Alice Roofer',
      site_name:      '42 Oak Street',
      category_name:  'Roof Mount',
      latitude:       34.0522,
      longitude:      -118.2437,
      status:         'draft',
      metadata: {
        type:           'roof_mount',
        roof_material:  'Asphalt Shingle',
        rafter_size:    '2x6',
        rafter_spacing: '24in',
        roof_age_years: 8,
        azimuth:        185,
      },
    };

    const res = await request(app)
      .post('/api/surveys')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.metadata.type).toBe('roof_mount');
    expect(res.body.metadata.roof_material).toBe('Asphalt Shingle');
    expect(res.body.metadata.azimuth).toBe(185);
    createdIds.push(res.body.id);
  });

  it('saves and returns Solar Fencing metadata', async () => {
    const payload = {
      project_name:   'Agrivoltaic Project Delta',
      inspector_name: 'Carlos Fence',
      site_name:      'Paddock 7',
      category_name:  'Solar Fencing',
      latitude:       37.7749,
      longitude:      -122.4194,
      status:         'draft',
      metadata: {
        type:                'solar_fencing',
        perimeter_length_ft: 1200,
        lower_shade_risk:    false,
        foundation_type:     'Driven Piles',
        bifacial_surface:    'Gravel',
      },
    };

    const res = await request(app)
      .post('/api/surveys')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.metadata.type).toBe('solar_fencing');
    expect(res.body.metadata.perimeter_length_ft).toBe(1200);
    expect(res.body.metadata.foundation_type).toBe('Driven Piles');
    createdIds.push(res.body.id);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/surveys')
      .send({ notes: 'missing required fields' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/surveys', () => {
  it('returns surveys array with total count', async () => {
    const res = await request(app).get('/api/surveys');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.surveys)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/surveys?status=draft');
    expect(res.status).toBe(200);
    res.body.surveys.forEach((s: { status: string }) => {
      expect(s.status).toBe('draft');
    });
  });
});

describe('GET /api/surveys/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/surveys/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns full survey object for known id', async () => {
    // Create one first
    const create = await request(app)
      .post('/api/surveys')
      .send({ project_name: 'Fetch Test', inspector_name: 'Bob', site_name: 'Site X' });
    createdIds.push(create.body.id);

    const res = await request(app).get(`/api/surveys/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(create.body.id);
    expect(Array.isArray(res.body.checklist)).toBe(true);
    expect(Array.isArray(res.body.photos)).toBe(true);
  });
});

describe('PUT /api/surveys/:id', () => {
  it('updates a survey status', async () => {
    const create = await request(app)
      .post('/api/surveys')
      .send({ project_name: 'Update Test', inspector_name: 'Alice', site_name: 'Site Y', status: 'draft' });
    createdIds.push(create.body.id);

    const res = await request(app)
      .put(`/api/surveys/${create.body.id}`)
      .send({ status: 'submitted' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/surveys/00000000-0000-0000-0000-000000000000')
      .send({ status: 'submitted' });
    expect(res.status).toBe(404);
  });
});

// ----------------------------------------------------------------
// Batch Sync
// ----------------------------------------------------------------
describe('POST /api/surveys/sync', () => {
  it('syncs a batch of offline surveys', async () => {
    const offlineId = '11111111-1111-1111-1111-111111111111';
    createdIds.push(offlineId);

    const res = await request(app)
      .post('/api/surveys/sync')
      .send({
        device_id: 'test-device-001',
        surveys: [
          {
            action: 'create',
            survey: {
              id:             offlineId,
              project_name:   'Offline Sync Project',
              inspector_name: 'Sync Tester',
              site_name:      'Offline Site',
              latitude:       -33.8688,
              longitude:      151.2093,
              status:         'submitted',
              checklist: [
                { label: 'Power', status: 'pass', notes: '' },
              ],
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(1);
    expect(res.body.results[0].success).toBe(true);
    expect(res.body.results[0].action).toBe('created');
  });

  it('returns 400 when surveys array is missing', async () => {
    const res = await request(app)
      .post('/api/surveys/sync')
      .send({ device_id: 'x' });
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------
// Export endpoints
// ----------------------------------------------------------------
describe('GET /api/surveys/export/geojson', () => {
  it('returns valid GeoJSON FeatureCollection', async () => {
    const res = await request(app).get('/api/surveys/export/geojson');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(res.body.metadata.crs).toBe('EPSG:4326');
    // Every feature with a location has lon/lat in geometry
    res.body.features
      .filter((f: { geometry: unknown }) => f.geometry)
      .forEach((f: { geometry: { type: string; coordinates: number[] }; properties: { latitude: number; longitude: number; metadata: unknown } }) => {
        expect(f.geometry.type).toBe('Point');
        expect(f.geometry.coordinates).toHaveLength(2);
        expect(typeof f.properties.latitude).toBe('number');
      });
    // Features with solar metadata include the metadata property
    const solarFeatures = res.body.features.filter(
      (f: { properties: { metadata?: { type?: string } } }) => f.properties.metadata?.type
    );
    if (solarFeatures.length > 0) {
      const types = solarFeatures.map((f: { properties: { metadata: { type: string } } }) => f.properties.metadata.type);
      types.forEach((t: string) => {
        expect(['ground_mount', 'roof_mount', 'solar_fencing']).toContain(t);
      });
    }
  });
});

describe('GET /api/surveys/export/csv', () => {
  it('returns CSV with header row including metadata columns', async () => {
    const res = await request(app).get('/api/surveys/export/csv');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toMatch(/text\/csv/);
    const lines = (res.text as string).split('\n').filter(Boolean);
    // Header row should exist with base columns
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('project_name');
    expect(lines[0]).toContain('latitude');
    expect(lines[0]).toContain('longitude');
    expect(lines[0]).toContain('status');
    // Solar metadata columns should be present
    expect(lines[0]).toContain('soil_type');
    expect(lines[0]).toContain('roof_material');
    expect(lines[0]).toContain('perimeter_length_ft');
    expect(lines[0]).toContain('metadata_json');
  });

  it('includes flattened metadata fields for Ground Mount surveys', async () => {
    // Create a ground-mount survey
    const create = await request(app)
      .post('/api/surveys')
      .send({
        project_name: 'CSV Meta Test', inspector_name: 'Tester', site_name: 'Field C',
        latitude: 51.0, longitude: -1.0,
        metadata: { type: 'ground_mount', soil_type: 'Rocky', slope_degrees: 4.2,
                    trenching_path: 'Clear path', vegetation_clearing: false },
      });
    createdIds.push(create.body.id);

    const res = await request(app).get('/api/surveys/export/csv');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Rocky');
    expect(res.text).toContain('4.2');
    expect(res.text).toContain('ground_mount');
  });
});
