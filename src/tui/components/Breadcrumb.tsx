import React, { Fragment } from "react";
import { Box, Text } from "ink";

import { BREADCRUMB_SLASH } from "../theme/icons.js";

export interface BreadcrumbProps {
  /**
   * Ordered path segments. Leftmost = root, rightmost = current location.
   * Last segment is rendered bold (terminal default color); earlier ones are
   * rendered dim.
   */
  parts: ReadonlyArray<string>;
}

export function Breadcrumb({ parts }: BreadcrumbProps): React.ReactElement {
  return (
    <Box width="100%">
      <Text>
        {parts.map((part, index) => {
          const isLast = index === parts.length - 1;
          return (
            <Fragment key={`${index}:${part}`}>
              {index > 0 && (
                <Text dimColor>{` ${BREADCRUMB_SLASH} `}</Text>
              )}
              {isLast ? (
                <Text bold>{part}</Text>
              ) : (
                <Text dimColor>{part}</Text>
              )}
            </Fragment>
          );
        })}
      </Text>
    </Box>
  );
}
