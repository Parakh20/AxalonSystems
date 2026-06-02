// website/nextjs/lib/cameras.ts

export type Camera = {
  id: string
  name: string
  sensorWidthMm: number
  sensorHeightMm: number
  focalLengthMm: number
  resolutionW: number
  resolutionH: number
  custom?: boolean
}

export const CAMERAS: Camera[] = [
  {
    id: 'itl612r-pro',
    name: 'iTL612R Pro',
    sensorWidthMm: 7.68,
    sensorHeightMm: 6.144,
    focalLengthMm: 25,
    resolutionW: 640,
    resolutionH: 512,
  },
  {
    id: 'dji-xt2',
    name: 'DJI Zenmuse XT2',
    sensorWidthMm: 8.8,
    sensorHeightMm: 7.04,
    focalLengthMm: 13,
    resolutionW: 640,
    resolutionH: 512,
  },
  {
    id: 'flir-vue-pro-r',
    name: 'FLIR Vue Pro R',
    sensorWidthMm: 10.88,
    sensorHeightMm: 8.704,
    focalLengthMm: 13,
    resolutionW: 640,
    resolutionH: 512,
  },
  {
    id: 'dji-h20t',
    name: 'DJI Zenmuse H20T',
    sensorWidthMm: 8.0,
    sensorHeightMm: 6.0,
    focalLengthMm: 58,
    resolutionW: 640,
    resolutionH: 512,
  },
  {
    id: 'custom',
    name: 'Custom…',
    sensorWidthMm: 7.68,
    sensorHeightMm: 6.144,
    focalLengthMm: 25,
    resolutionW: 640,
    resolutionH: 512,
    custom: true,
  },
]

export const DEFAULT_CAMERA = CAMERAS[0]

export function getCamera(id: string): Camera {
  return CAMERAS.find((c) => c.id === id) ?? DEFAULT_CAMERA
}
