import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { formatClockTime, parseClockTime } from "@/lib/time-display";

/** Locale-independent 12-hour editor; hidden field keeps canonical form submissions. */
export function TimeInput({value, defaultValue, onChange, onBlur, name, ...props}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue"> & {value?: string; defaultValue?: string}) {
  const [canonical, setCanonical] = useState(value ?? defaultValue ?? "");
  const [text, setText] = useState(() => formatClockTime(value ?? defaultValue ?? ""));
  useEffect(() => {
    if (value !== undefined) { setCanonical(value); setText(formatClockTime(value)); }
  }, [value]);
  return <>
    <input {...props} type="text" placeholder={props.placeholder || "1:00pm"} value={text}
      pattern="(1[0-2]|[1-9]):[0-5][0-9]\\s*([aA][mM]|[pP][mM])"
      onChange={event => {
        const entered = event.target.value;
        setText(entered);
        const parsed = entered === "" ? "" : parseClockTime(entered);
        event.target.setCustomValidity(parsed === null ? "Enter a time such as 1:00pm." : "");
        if (parsed !== null) {
          setCanonical(parsed);
          onChange?.({...event, target: {...event.target, value: parsed}, currentTarget: {...event.currentTarget, value: parsed}} as ChangeEvent<HTMLInputElement>);
        }
      }} onBlur={event => {
        if (parseClockTime(text)) setText(formatClockTime(canonical));
        onBlur?.(event);
      }} />
    {name && <input type="hidden" name={name} value={canonical} />}
  </>;
}
