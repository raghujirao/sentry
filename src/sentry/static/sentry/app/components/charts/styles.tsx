import React from 'react';
import styled from '@emotion/styled';

import Tooltip from 'app/components/tooltip';
import {IconQuestion} from 'app/icons';
import space from 'app/styles/space';

export const ChartControls = styled('div')`
  display: flex;
  justify-content: space-between;
  padding: ${space(1)} ${space(3)};
  border-top: 1px solid ${p => p.theme.borderLight};
`;

export const SubHeading = styled('h3')`
  font-size: ${p => p.theme.fontSizeLarge};
  font-weight: normal;
  color: ${p => p.theme.gray5};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SectionHeading = styled('h4')`
  color: ${p => p.theme.gray3};
  font-size: ${p => p.theme.fontSizeMedium};
  margin: ${space(1)} 0;
  padding-right: ${space(1)};
  line-height: 1.2;
`;

export const SectionValue = styled('span')`
  color: ${p => p.theme.gray3};
  font-size: ${p => p.theme.fontSizeMedium};
  margin-right: ${space(1)};
`;

export const InlineContainer = styled('div')`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-left: ${space(2)};

  &:first-child {
    margin-left: 0;
  }
`;

const QuestionIconContainer = styled('span')`
  margin-left: ${space(1)};
  & svg {
    color: ${p => p.theme.gray1};
  }
`;

type QuestionProps = {
  title: string;
  size: string;
} & Pick<React.ComponentProps<typeof Tooltip>, 'position'> &
  Partial<Pick<React.ComponentProps<typeof Tooltip>, 'containerDisplayMode'>>;

function QuestionTooltip({title, size, ...tooltipProps}: QuestionProps) {
  return (
    <QuestionIconContainer>
      <Tooltip title={title} {...tooltipProps}>
        <IconQuestion size={size} />
      </Tooltip>
    </QuestionIconContainer>
  );
}
export {QuestionTooltip};
