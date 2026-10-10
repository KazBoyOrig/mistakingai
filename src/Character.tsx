export default function Character({ small = false }: { small?: boolean }) {
  return <div className={`character${small ? ' character-small' : ''}`} aria-hidden="true">
    <div className="robot-antenna" />
    <div className="robot-head"><div className="robot-face"><i /><i /><span /></div><b>?</b></div>
    <div className="robot-body"><span>%</span></div>
    <div className="robot-hand" />
    <div className="robot-shadow" />
  </div>;
}
