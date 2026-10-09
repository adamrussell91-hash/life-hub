export type IsoDate = string;
export type HHMM = string;
export type Currency =
  | 'AUD'
  | 'MYR'
  | 'TRY'
  | 'GBP'
  | 'EUR'
  | 'KRW'
  | 'CAD'
  | 'USD'
  | 'JPY'
  | 'NZD'
  | 'SGD';
export type SceneId = 'kul' | 'ist' | 'sco' | 'lon' | 'rom' | 'sel' | 'generic';
export type Status = 'planned' | 'booked' | 'todo' | 'idea';
export type HopMode = 'walk' | 'train' | 'tram' | 'bus' | 'taxi' | 'ferry';
export type GuideIcon = 'phone' | 'transport' | 'money' | 'weather' | 'paperwork';

export interface Money {
  amount: number;
  currency: Currency;
  aud: number;
  rate: number;
  rate_date: IsoDate;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
  address?: string;
}

export interface Hop {
  mode: HopMode;
  minutes: number;
  note?: string;
  cost?: Money;
}

export interface City {
  id: string;
  name: string;
  country: string;
  tz: string;
  start_date: IsoDate;
  end_date: IsoDate;
  title: string;
  scene: SceneId;
  accent: { color: string; soft: string; ink: string };
  facts: string[];
  center: { lat: number; lon: number };
  local_currency: Currency;
  driver_phrase?: { local: string; english: string };
  arrival_guide?: { title: string; rows: { icon: GuideIcon; text: string }[] };
  directions_app: 'google' | 'naver';
}

interface ItemBase {
  id: string;
  city_id: string;
  date: IsoDate;
  time: HHMM | null;
  title: string;
  note: string;
  status: Status;
  cost?: Money;
  booking_ref?: string;
  private?: boolean;
  link?: string;
  hop?: Hop;
  created_at: string;
  updated_at: string;
}

export interface PlaceItem extends ItemBase {
  kind: 'do' | 'food' | 'transit' | 'med' | 'post';
  place?: Place;
  off_map_label?: string;
}

export interface StayItem extends ItemBase {
  kind: 'stay';
  place?: Place;
  nights: number;
  check_out_date: IsoDate;
  check_in_time?: HHMM;
  cancel_until?: string;
  home_base: boolean;
}

export interface TicketItem extends ItemBase {
  kind: 'flight' | 'train';
  carrier: string;
  number: string;
  from_code: string;
  to_code: string;
  from_name?: string;
  to_name?: string;
  depart_time: HHMM;
  arrive_time: HHMM;
  arrive_date: IsoDate;
  arrive_city_id?: string;
  source?: string;
}

export interface CheckinSlot extends ItemBase {
  kind: 'checkin_slot';
}

export type Item = PlaceItem | StayItem | TicketItem | CheckinSlot;

export interface Checkin {
  id: string;
  at: string;
  city_id: string;
  label: string;
  /** When set, this is a stop-level "marked safe" on an itinerary item. */
  item_id?: string;
  /** Optional place photo (Netlify Blobs id, served via /api/travel-photo). */
  photo_id?: string;
}

/** Public/redacted item fields for follower-visible safe ticks. */
export type PublicSafeFields = {
  safe_at?: string;
  safe_photo_id?: string;
};

export interface DayMeta {
  city_id: string;
  date: IsoDate;
  subtitle?: string;
  penelope_prompt?: string;
}

export interface Trip {
  id: string;
  schema_version: 1;
  title: string;
  start_date: IsoDate;
  end_date: IsoDate;
  home_tz: string;
  followers_label: string;
  cities: City[];
  items: Item[];
  days: DayMeta[];
  checkins: Checkin[];
  share: { enabled: boolean; created_at: string | null };
  created_at: string;
  updated_at: string;
}

export interface TripSummary {
  id: string;
  title: string;
  start_date: IsoDate;
  end_date: IsoDate;
  cities: string[];
  countries: string[];
}

export type MoneyDraft = { amount: number; currency: Currency };
export type ItemDraft = Omit<Item, 'id' | 'created_at' | 'updated_at' | 'cost'> & {
  id?: string;
  cost?: Money | MoneyDraft;
  created_at?: string;
  updated_at?: string;
};
