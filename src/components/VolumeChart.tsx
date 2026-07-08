import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { HudLabel, Panel } from './ui'
import { ChartSkeleton } from './empty/EmptyStates'

interface VolumeChartProps {
  chartData: Record<string, number>[]
}

export function VolumeChart({ chartData }: VolumeChartProps) {
  const ready = chartData.length > 1

  return (
    <>
      <HudLabel className="mb-2 block text-xs tracking-[0.15em]">Volume over time</HudLabel>
      <Panel padding="md" className="h-72">
        {ready ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="t" stroke="#88889a" fontSize={11} />
              <YAxis stroke="#88889a" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(12,12,18,0.95)',
                  border: '1px solid #22222a',
                  borderRadius: 8,
                }}
              />
              {Object.keys(chartData[0] || {})
                .filter(k => k !== 't')
                .slice(0, 5)
                .map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={i % 2 === 0 ? '#e6002e' : '#00e5ff'}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartSkeleton />
        )}
      </Panel>
      <HudLabel className="mt-3 block text-center text-[10px] tracking-[0.25em] text-[var(--muted)]">
        Narrative arbitrage · Local analysis · X signals
      </HudLabel>
    </>
  )
}
