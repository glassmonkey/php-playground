import {Version} from "./php-wasm/php";

export type Format = "html" | "console";


export function SelectFormat(
    {
        format,
        onChange,
    }: {
        format: Format;
        updateFormat: (f: Format) => void;
    }
) {
    return format
}