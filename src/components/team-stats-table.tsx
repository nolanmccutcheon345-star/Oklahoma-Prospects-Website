const labels: Record<string,string> = {gp:"Games played",ab:"At bats",h:"Hits",r:"Runs",hr:"Home runs",rbi:"RBI",sb:"Stolen bases",bb:"Walks",so:"Strikeouts",avg:"Batting average",obp:"On-base percentage",slg:"Slugging",ops:"OPS",era:"ERA",ip:"Innings pitched",velo:"Velocity (mph)"};
export function StatsTable({stats}: {stats: Record<string,number>}) {
  const entries = Object.entries(stats);
  if (!entries.length) return <p className="mt-2 text-sm">Stats have not been recorded yet.</p>;
  return <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr><th className="p-2">Stat</th><th className="p-2">Value</th></tr></thead>
    <tbody>{entries.map(([key,value]) => <tr key={key} className="border-t"><th scope="row" className="p-2 font-medium">{labels[key] || key.toUpperCase()}</th>
      <td className="p-2">{["avg","obp","slg","ops"].includes(key) ? value.toFixed(3) : key === "era" ? value.toFixed(2) : value}</td>
    </tr>)}</tbody>
  </table></div>;
}
