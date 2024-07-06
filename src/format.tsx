import {Checkbox} from "@chakra-ui/react";
import * as React from 'react';
import {useState} from "react";

export type Format = "html" | "console";


export function SelectFormat(
    {
        format,
        updateFormat,
    }: {
        format: Format;
        updateFormat: (f: Format) => void;
    }
) {
    const [isHtml, setIsHtml] = useState<boolean>(format === "html");

    return <Checkbox
        data-testid="checkbox-format"
        isChecked={isHtml}
        onChange={(e) => {
            updateFormat(e.target.checked ? "html" : "console");
            setIsHtml(e.target.checked);
        }}>
        HTML Preview
    </Checkbox>
}