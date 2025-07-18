import { Section, Text, Button } from '@react-email/components';
import * as React from 'react';
import { button, content, paragraph } from '../css/styles';
import { MailBody } from '../partials/partials';

interface Props {
  code: string;
}

export const MfaCodeEmail = ({ code }: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi there,</Text>
        <Text style={paragraph}>Your MFA code is:</Text>
        <Text style={paragraph}>{code}</Text>
      </Section>
    </MailBody>
  );
};

export default MfaCodeEmail;
