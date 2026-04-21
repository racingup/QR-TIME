/**
 * Test fixtures that mirror the shape of the backend seed_demo data.
 * Update when the seed / API shape changes.
 */

export const aliceSummary = {
  username: 'alice',
  is_manager: false,
  is_superuser: false,
  weekly_target_hours: '42.00',
  daily_target_hours: '8.40',
  overtime_balance_hours: '0.60',
  vacation_quota: 25,
  vacation_used: '0.00',
  vacation_remaining: '25.00',
  today: {
    worked_minutes: 240, // currently clocked in 4h
    target_minutes: 504, // 8.4h = 504 min
    has_open_session: true,
  },
}

export const claireSummary = {
  username: 'claire',
  is_manager: true,
  is_superuser: false,
  weekly_target_hours: '42.00',
  daily_target_hours: '8.40',
  overtime_balance_hours: '0.00',
  vacation_quota: 30,
  vacation_used: '0.00',
  vacation_remaining: '30.00',
  today: { worked_minutes: 0, target_minutes: 504, has_open_session: false },
}

export const aliceHistory = [
  {
    id: 1,
    user: 1,
    session_type: 'OFFICE',
    site: 1,
    mission: null,
    clock_in: '2026-04-20T09:00:00Z',
    clock_out: '2026-04-20T12:30:00Z',
    clock_in_rounded: '2026-04-20T09:00:00Z',
    clock_out_rounded: '2026-04-20T12:30:00Z',
    duration_minutes: 210,
    is_open: false,
    justification: '',
    justification_approved: null,
    is_forgotten: false,
  },
  {
    id: 2,
    user: 1,
    session_type: 'OFFICE',
    site: 1,
    mission: null,
    clock_in: '2026-04-20T13:30:00Z',
    clock_out: '2026-04-20T19:00:00Z',
    clock_in_rounded: '2026-04-20T13:30:00Z',
    clock_out_rounded: '2026-04-20T19:00:00Z',
    duration_minutes: 330,
    is_open: false,
    justification: '',
    justification_approved: null,
    is_forgotten: false,
  },
  {
    id: 3,
    user: 1,
    session_type: 'OFFICE',
    site: 1,
    mission: null,
    clock_in: '2026-04-21T09:00:00Z',
    clock_out: null,
    clock_in_rounded: '2026-04-21T09:00:00Z',
    clock_out_rounded: null,
    duration_minutes: 0,
    is_open: true,
    justification: '',
    justification_approved: null,
    is_forgotten: false,
  },
]

export const presence = {
  present: [
    {
      user_id: 1,
      username: 'alice',
      session_type: 'OFFICE',
      site_name: 'Siège Paris',
      clock_in: '2026-04-21T07:00:00Z',
      clock_in_rounded: '2026-04-21T07:00:00Z',
    },
  ],
  count: 1,
}

export const alerts = {
  alerts: [],
  pending_justifications: [],
}

export const pendingMissions = {
  count: 1,
  results: [
    {
      id: 42,
      user: 2,
      mission_type: 'FIELD',
      date_start: '2026-04-22',
      date_end: '2026-04-22',
      location_name: 'Client Renault Boulogne',
      location_lat: null,
      location_lon: null,
      gps_radius_meters: 300,
      qr_token: null,
      status: 'PENDING',
      approved_by: null,
      manager_comment: '',
      created_at: '2026-04-21T09:00:00Z',
      updated_at: '2026-04-21T09:00:00Z',
    },
  ],
}

export const pendingAbsences = {
  count: 1,
  results: [
    {
      id: 1,
      user: 3,
      absence_type: 'VACATION',
      date_start: '2026-04-28',
      date_end: '2026-05-02',
      status: 'PENDING',
      approved_by: null,
      manager_comment: '',
      created_at: '2026-04-21T13:56:56Z',
      updated_at: '2026-04-21T13:56:56Z',
    },
  ],
}
