export type SchoolType = '1AB' | '1C' | 'Type2' | 'Type3';

export type Medium = 'Tamil' | 'English' | 'Sinhala';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface School {
  id: string;
  name: string;
  nameLocal?: string; // Tamil name
  address: string;
  lat: number;
  lng: number;
  medium: Medium[];
  type: SchoolType;
  zone: string;
  contactPhone?: string;
}

export interface SchoolWithDistance extends School {
  /** Geodesic (straight-line) distance in meters */
  straightLineDistance: number;
  /** Driving distance in meters, fetched from open-source routing (OSRM) */
  drivingDistance?: number;
  /** Driving duration in seconds */
  drivingDuration?: number;
  /** Human-readable driving distance string */
  drivingDistanceText?: string;
  /** Human-readable driving duration string */
  drivingDurationText?: string;
  /** Admission distance band label */
  distanceBand: string;
  /** Whether school is within the selected radius */
  withinRadius: boolean;
}
