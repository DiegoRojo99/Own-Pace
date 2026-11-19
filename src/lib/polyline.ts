export function decodePolyline(encoded: string): [number, number][] {
  if (encoded.length > 200_000) throw new Error("Route is too large");

  const points: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  function readCoordinate() {
    let value = 0;
    let shift = 0;
    let chunk: number;
    do {
      if (index >= encoded.length || shift > 30) throw new Error("Invalid route polyline");
      chunk = encoded.charCodeAt(index++) - 63;
      if (chunk < 0 || chunk > 63) throw new Error("Invalid route polyline");
      value += (chunk & 31) * 2 ** shift;
      shift += 5;
    } while (chunk >= 32);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  }

  while (index < encoded.length) {
    latitude += readCoordinate();
    longitude += readCoordinate();
    const lat = latitude / 100_000;
    const lng = longitude / 100_000;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Invalid route coordinates");
    points.push([lat, lng]);
  }
  return points;
}
