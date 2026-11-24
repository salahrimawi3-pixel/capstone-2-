import { Fragment } from 'react';
import { DEPOT, SCHOOL } from './data.js';

const roads = Array.from({ length: 7 }, (_, index) => index + 1);

function trafficColor(factor) {
  if (factor < 1.3) return 'var(--ok)';
  return factor < 1.7 ? 'var(--warn)' : 'var(--bad)';
}

export function RouteMap({ route, students = [], hideStudentNames = false }) {
  const points = route?.path ?? [DEPOT, ...students, SCHOOL];
  const depot = points[0];
  const school = points.at(-1);
  const latitudes = points.map(({ lat }) => lat);
  const longitudes = points.map(({ lng }) => lng);
  const south = Math.min(...latitudes) - 0.008;
  const north = Math.max(...latitudes) + 0.008;
  const west = Math.min(...longitudes) - 0.01;
  const east = Math.max(...longitudes) + 0.01;
  const x = ({ lng }) => 30 + ((lng - west) / (east - west)) * 540;
  const y = ({ lat }) => 370 - ((lat - south) / (north - south)) * 340;
  return (
    <svg
      className="map"
      viewBox="0 0 600 400"
      role="img"
      aria-label="Schematic map of the Amman school bus route"
    >
      <rect width="600" height="400" fill="var(--mapbg)" />
      {roads.map((i) => (
        <Fragment key={i}>
          <path
            d={`M0 ${i * 50}Q300 ${i * 50 + (i % 2 ? 22 : -22)} 600 ${i * 50 - 12}`}
            stroke="var(--road)"
            strokeWidth={i % 3 ? 2 : 5}
            fill="none"
          />
          <path
            d={`M${i * 75} 0Q${i * 75 + 20} 200 ${i * 75 - 14} 400`}
            stroke="var(--road)"
            strokeWidth="2"
            fill="none"
          />
        </Fragment>
      ))}
      {route
        ? points
            .slice(1)
            .map((point, i) => (
              <line
                key={i}
                x1={x(points[i])}
                y1={y(points[i])}
                x2={x(point)}
                y2={y(point)}
                stroke={trafficColor(route.optimized.segments[i])}
                strokeWidth="4"
                strokeLinecap="round"
              />
            ))
        : students.map((student) => (
            <circle key={student.id} cx={x(student)} cy={y(student)} r="6" fill="var(--blue)" />
          ))}
      <rect x={x(depot) - 7} y={y(depot) - 7} width="14" height="14" fill="#64708a" />
      <text x={x(depot) + 11} y={y(depot) + 4} fontSize="11" fill="var(--tx)">
        Depot
      </text>
      {route?.endsAtSchool !== false && <>
      <circle cx={x(school)} cy={y(school)} r="11" fill="var(--navy)" stroke="#fff" strokeWidth="2" />
      <text
        x={x(school)}
        y={y(school) + 4}
        fontSize="11"
        fill="#fff"
        textAnchor="middle"
        fontWeight="700"
      >
        S
      </text>
      <text x={x(school) + 14} y={y(school) + 4} fontSize="11" fill="var(--tx)">
        School
      </text>
      </>}
      {route?.order.map((student, i) => (
        <g key={student.id}>
          {!hideStudentNames && (
            <title>
              {student.name} · {student.area}
            </title>
          )}
          <circle
            cx={x(student)}
            cy={y(student)}
            r="10"
            fill="var(--blue)"
            stroke="#fff"
            strokeWidth="2"
          />
          <text
            x={x(student)}
            y={y(student) + 4}
            fontSize="11"
            fill="#fff"
            textAnchor="middle"
            fontWeight="700"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
