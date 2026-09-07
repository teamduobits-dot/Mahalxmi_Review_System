// Hand-drawn style food icons (inline SVG) — lightweight, crisp on retina,
// and 100% consistent with the brand palette. Used for illustrations and
// loading/celebration animations. No external image dependencies.
const palette = {
  bun: '#F5A623',
  bunDark: '#E08A00',
  patty: '#8A4B2D',
  cheese: '#FFC53D',
  lettuce: '#7ED957',
  tomato: '#FF6B57',
  cream: '#FFF3DE',
  red: '#FF5A1F',
  gold: '#FFC41F',
  green: '#34C77B',
}

const P = palette

const SHAPES = {
  burger: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M10 30c0-8.5 9.8-13 22-13s22 4.5 22 13c0 3-1.8 5.6-4.4 7.4-3.7 2.5-10.4 3.6-17.6 3.6S15.1 39.9 11.4 37.4C8.8 35.6 10 33 10 30z" fill={P.bun} />
      <path d="M10 30c0-8.5 9.8-13 22-13s22 4.5 22 13H10z" fill="#FFE3B3" />
      <circle cx="20" cy="26" r="1.3" fill="#FFF" opacity=".85" />
      <circle cx="27" cy="24.6" r="1.1" fill="#FFF" opacity=".7" />
      <circle cx="33.5" cy="24.8" r="1.2" fill="#FFF" opacity=".8" />
      <circle cx="40" cy="26" r="1.2" fill="#FFF" opacity=".7" />
      <path d="M10 33.5h44l-2.4 3.9c-3.7 2.5-10.4 3.6-17.6 3.6S15.1 39.9 11.4 37.4L10 33.5z" fill={P.patty} />
      <path d="M11.6 35.2c2.4 1.7 7.8 3 14.4 3.4l2.8-3.9h9.4l2.6 3.9c6.6-.4 12-1.7 14.4-3.4l-1.2-1.7H12.8l-1.2 1.7z" fill={P.cheese} />
      <path d="M12 38.6c1.4 1.9 2.5 3.4 3.4 4.5 1.6 2 3.5 3.6 5.6 4.7 2.5 1.3 6 2.2 11 2.2s8.5-.9 11-2.2c2.1-1.1 4-2.7 5.6-4.7.9-1.1 2-2.6 3.4-4.5 0 0-1.2.4-4 .8-3.6.6-9.5 1-16 .4-6.5-.6-12.4-1.6-20-1.2z" fill={P.lettuce} />
      <circle cx="50" cy="19" r="2.4" fill={P.tomato} opacity=".9" />
      <circle cx="14.5" cy="44.5" r="1.6" fill={P.gold} opacity=".8" />
      <circle cx="47" cy="46" r="1.4" fill={P.green} opacity=".7" />
    </svg>
  ),
  fries: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M22 58h20l-2.4-34h-15L22 58z" fill={P.red} />
      <path d="M22 58h20l-1.6-22h-16.8L22 58z" fill="#E84818" />
      <path d="M26 12.5c0-1.4.9-2.5 2-2.5s2 1.1 2 2.5V24h-4V12.5z" fill={P.gold} />
      <path d="M32 10.5c0-1.4.9-2.5 2-2.5s2 1.1 2 2.5V24h-4V10.5z" fill="#FFB33D" />
      <path d="M26 12.5V24" stroke="#E8A200" strokeWidth="1" />
      <path d="M34 10.5V24" stroke="#E8A200" strokeWidth="1" />
      <path d="M38 8.5V24h2V10.5c0-1.4-.9-2.5-2-2.5z" fill={P.gold} />
      <path d="M26.5 29.5L38 24l-1.6 34h-8.3l-1.6-28.5z" fill="#FFD93B" />
      <path d="M38 24l2.4-11.5c0-1.4-.9-2.5-2-2.5" stroke="#E8A200" strokeWidth="1" />
      <path d="M30 34h4v8h-4z" fill={P.red} opacity=".85" />
      <path d="M27.5 44h6v6h-6z" fill={P.red} opacity=".85" />
    </svg>
  ),
  pizza: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 8L10.5 55.5 54 55 49.6 8H32z" fill={P.gold} />
      <path d="M32 8L10.5 55.5 54 55 49.6 8H32z" fill="#FFB33D" opacity=".55" />
      <path d="M32 8l-6 15h12l-6-15z" fill={P.cheese} />
      <path d="M18.8 22.4c-3.6 1-5.4 2.8-4.9 4.4 2.6.8 7.4 1.5 12.9 2.1 5.8.7 11.3 1 16 .9 1.4-1.6 1.5-3.4.6-5.1-3.2.6-8.6 1-14.6 1.3-7.2.3-12.9-.1-10-3.6z" fill={P.cream} opacity=".9" />
      <circle cx="21" cy="27" r="2.3" fill={P.tomato} />
      <circle cx="30" cy="24.5" r="2.3" fill={P.tomato} />
      <circle cx="39" cy="26" r="2.3" fill={P.tomato} />
      <circle cx="47" cy="25" r="2.3" fill={P.tomato} />
      <circle cx="25" cy="34" r="1.6" fill={P.green} />
      <circle cx="34" cy="33" r="1.6" fill={P.green} />
      <circle cx="43" cy="34" r="1.6" fill={P.green} />
    </svg>
  ),
  taco: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M10 38c0-6 9.8-9 22-9s22 3 22 9c0 1.6-.6 3-1.8 4.2-2.9 3-10 4.8-20.2 4.8S14.7 45.2 11.8 42.2C10.6 41 10 39.6 10 38z" fill={P.gold} />
      <path d="M12 36.5c2.6-2 8.4-3.5 20-3.5s17.4 1.5 20 3.5v1.5c-2.6-2-8.4-3.5-20-3.5s-17.4 1.5-20 3.5v-1.5z" fill="#FFE3A0" />
      <path d="M10 38c0 1.6.6 3 1.8 4.2l-3 1.3 4.5-3.2c1.6 1.1 4.3 1.7 8.7 1.7h4c3.6 0 5.8-.4 7.4-1.1l6.6 4.6-3.4-1.4c1.3-1.2 2.4-2.6 2.4-4.1 0-3.6-6.6-6-22-6s-22 2.4-22 6z" fill={P.tomato} opacity=".85" />
      <path d="M10 38c0-3 7.4-4.4 22-4.4s22 1.4 22 4.4" stroke={P.gold} strokeWidth="1.4" fill="none" />
      <circle cx="20" cy="38.5" r="1.7" fill={P.green} />
      <circle cx="27" cy="38.5" r="1.7" fill={P.cream} />
      <circle cx="34" cy="38.5" r="1.7" fill={P.green} />
      <circle cx="41" cy="38.5" r="1.7" fill={P.cream} />
    </svg>
  ),
  drink: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M24 30.5c0-3 2.7-5 5.5-5h5c2.8 0 5.5 2 5.5 5V56H24V30.5z" fill="#FFB33D" opacity=".9" />
      <path d="M24 32c0-2.6 2.7-4.5 5.5-4.5h5c2.8 0 5.5 1.9 5.5 4.5v3H24v-3z" fill="#FFD98C" />
      <path d="M24 56h16" stroke="#E84818" strokeWidth="2" />
      <path d="M40 26.5L52 15c1.2-1.2 3.6-.4 3.6 1.4 0 1.3-.8 2.6-2 3.5L40 26.5z" fill={P.cream} stroke="#F0B7A0" strokeWidth="1" />
      <path d="M45.6 15.8l-1.8 2.4 1.8 1.4 1.8-2.4-1.8-1.4z" fill="#7ED957" opacity=".9" />
      <circle cx="42" cy="20.6" r="1.3" fill={P.tomato} />
      <path d="M26.5 20h11M26.5 14.5h11" stroke="#FF7A33" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  hotdog: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M12 32c0-9 4.5-13 20-13s20 4 20 13-4.5 13-20 13-20-4-20-13z" fill={P.gold} />
      <path d="M12 32c0-7.5 4.5-11 20-11s20 3.5 20 11-4.5 11-20 11-20-3.5-20-11z" fill="#FFB33D" />
      <path d="M15.5 34.5c3.4-1.2 9.6-2 16.5-2s13.1.8 16.5 2" stroke={P.tomato} strokeWidth="3" strokeLinecap="round" />
      <path d="M14.8 39.4c3.4-1 8.9-1.7 17.2-1.7s13.8.7 17.2 1.7" stroke={P.green} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19.5 44.5c3-0.8 7.5-1.3 12.5-1.3s9.5.5 12.5 1.3" stroke="#E8A200" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  icecream: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M32 56V34" stroke="#C98B4B" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M22 42.5L42 40l-1.6 8.5L23.6 51 22 42.5z" fill={P.cream} stroke="#F0B7A0" strokeWidth="1" />
      <path d="M22 42.5L42 40l-1.6 8.5L23.6 51 22 42.5z" fill="#F5B8A6" opacity=".5" />
      <path d="M32 12c-8.8 0-15 4.8-15 10.8 0 4.6 3.4 8 7.6 9.2l2.8-7.2c1.6.6 3 .9 4.6.9s3-.3 4.6-.9l2.8 7.2c4.2-1.2 7.6-4.6 7.6-9.2C47 16.8 40.8 12 32 12z" fill="#FF8FB8" />
      <path d="M32 12c-5.6 0-9.8 1.9-12.5 5 3 3.8 7.6 5.8 12.5 5.8s9.5-2 12.5-5.8c-2.7-3.1-6.9-5-12.5-5z" fill="#FFC0D6" />
      <circle cx="26" cy="16" r="1.4" fill="#FFF" opacity=".8" />
      <circle cx="38" cy="18" r="1.2" fill="#FFF" opacity=".7" />
    </svg>
  ),
  donut: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="22" fill="#E8A200" />
      <circle cx="32" cy="32" r="22" fill="#F5A623" opacity=".8" />
      <circle cx="32" cy="32" r="9.5" fill={P.cream} />
      <circle cx="32" cy="32" r="9.5" fill="#FFF3DE" />
      <path d="M21 27l-2.4 3.4M25.5 20.5l-2.8 2.5M33.5 17.5l-1.6 3.2M41 19.5l.2 3.7M46 25.5l-3.2 1.6" stroke="#FF7AD9" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="28" cy="35" r="1.5" fill="#FF7AD9" />
      <circle cx="37" cy="30" r="1.5" fill="#FF7AD9" />
      <circle cx="30" cy="45" r="1.3" fill="#7ED957" />
      <circle cx="40" cy="42" r="1.3" fill="#7ED957" />
    </svg>
  ),
}

export default function FoodIcon({ type = 'burger', size = 56, className = '' }) {
  const Shape = SHAPES[type] || SHAPES.burger
  return (
    <span className={`inline-block select-none ${className}`} style={{ width: size, height: size }}>
      <Shape size={size} />
    </span>
  )
}
