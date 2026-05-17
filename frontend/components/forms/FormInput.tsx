import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TextInputProps,
} from 'react-native';
import { colors, radii } from '../../constants/theme';

interface FormInputProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string;
}

export const FormInput: React.FC<FormInputProps> = ({
  label,
  required = false,
  error,
  editable = true,
  ...textInputProps
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
        {!editable && <Text style={styles.locked}> (Locked)</Text>}
      </Text>
      <TextInput
        style={[
          styles.input, 
          error && styles.inputError,
          !editable && styles.inputDisabled
        ]}
        placeholderTextColor={colors.inkSubtle}
        editable={editable}
        {...textInputProps}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    marginBottom: 6,
  },
  required: {
    color: colors.danger,
  },
  locked: {
    color: colors.inkSubtle,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 12,
    fontSize: 15,
    color: colors.ink,
    minHeight: 48,
  },
  inputError: {
    borderColor: colors.danger,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
    color: colors.inkSubtle,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
});

export default FormInput;
