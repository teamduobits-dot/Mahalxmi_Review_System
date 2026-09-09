import FoodIcon from './FoodIcon'

const ITEMS = [
  { type: 'burger', x: '5%', y: '8%', size: 56, delay: 0, dur: 9, drift: 18, rot: -12 },
  { type: 'fries', x: '84%', y: '8%', size: 50, delay: 0.8, dur: 10, drift: 20, rot: 10 },
  { type: 'pizza', x: '3%', y: '40%', size: 42, delay: 1.2, dur: 11, drift: 22, rot: 8 },
  { type: 'taco', x: '88%', y: '34%', size: 46, delay: 1.8, dur: 9, drift: 19, rot: -10 },
  { type: 'drink', x: '8%', y: '74%', size: 42, delay: 2.1, dur: 12, drift: 21, rot: 6 },
  { type: 'hotdog', x: '85%', y: '72%', size: 44, delay: 1.1, dur: 11, drift: 23, rot: -6 },
  { type: 'icecream', x: '76%', y: '90%', size: 38, delay: 2.4, dur: 8.5, drift: 17, rot: 8 },
  { type: 'donut', x: '14%', y: '91%', size: 38, delay: 2.8, dur: 10.5, drift: 20, rot: -5 },
]

export default function FloatingFood({ count = 6, opacity = 0.24 }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {ITEMS.slice(0, count).map((item) => (
        <div
          key={`${item.type}-${item.x}-${item.y}`}
          className="absolute will-change-transform"
          style={{ left: item.x, top: item.y, opacity }}
        >
          <div style={{ animation: `drift ${item.drift}s ease-in-out ${item.delay}s infinite alternate` }}>
            <div
              className="will-change-transform"
              style={{
                animation: `float ${item.dur}s ease-in-out ${item.delay}s infinite`,
                transform: `rotate(${item.rot}deg) translateZ(0)`,
              }}
            >
              <FoodIcon type={item.type} size={item.size} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
