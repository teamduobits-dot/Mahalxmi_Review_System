import { motion } from 'framer-motion'
import FoodIcon from './FoodIcon'

// A gentle, premium floating food backdrop — decorative only, never
// distracting. Each item drifts slowly and fades in softly.
const ITEMS = [
  { type: 'burger', x: '6%', y: '8%', size: 58, delay: 0, dur: 9, rot: -14 },
  { type: 'fries', x: '84%', y: '6%', size: 52, delay: 1.2, dur: 11, rot: 12 },
  { type: 'pizza', x: '4%', y: '38%', size: 46, delay: 0.6, dur: 12, rot: 8 },
  { type: 'taco', x: '88%', y: '34%', size: 48, delay: 1.8, dur: 10, rot: -10 },
  { type: 'drink', x: '8%', y: '72%', size: 44, delay: 2.2, dur: 13, rot: 6 },
  { type: 'hotdog', x: '86%', y: '70%', size: 46, delay: 0.9, dur: 12, rot: -8 },
  { type: 'icecream', x: '78%', y: '88%', size: 42, delay: 1.5, dur: 9, rot: 10 },
  { type: 'donut', x: '14%', y: '90%', size: 40, delay: 2.6, dur: 11, rot: -6 },
]

export default function FloatingFood({ count = 8, opacity = 0.5 }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {ITEMS.slice(0, count).map((item) => (
        <motion.div
          key={item.type}
          className="absolute"
          style={{ left: item.x, top: item.y, opacity: 0 }}
          animate={{ opacity, y: [0, -16, 0], rotate: [item.rot, item.rot + 7, item.rot] }}
          transition={{
            opacity: { duration: 1.4, delay: item.delay * 0.4 },
            y: { duration: item.dur, repeat: Infinity, ease: 'easeInOut', delay: item.delay },
            rotate: { duration: item.dur, repeat: Infinity, ease: 'easeInOut', delay: item.delay },
          }}
        >
          <FoodIcon type={item.type} size={item.size} />
        </motion.div>
      ))}
    </div>
  )
}
