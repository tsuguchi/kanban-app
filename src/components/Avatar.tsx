interface AvatarProps {
  name: string
  photoURL: string | null
  // ボードを抜けたメンバーは薄く表示する
  departed?: boolean
}

export function Avatar({ name, photoURL, departed = false }: AvatarProps) {
  const className = departed ? 'avatar avatar-departed' : 'avatar'
  if (photoURL) return <img src={photoURL} alt={name} title={name} className={className} />
  return (
    <span className={`${className} avatar-initial`} title={name} aria-label={name}>
      {name.slice(0, 1)}
    </span>
  )
}
