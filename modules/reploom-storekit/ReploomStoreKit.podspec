Pod::Spec.new do |s|
  s.name           = 'ReploomStoreKit'
  s.version        = '1.0.0'
  s.summary        = 'StoreKit 2 bridge for Reploom subscriptions.'
  s.description    = 'A small Expo module that exposes verified StoreKit 2 subscription transactions.'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Daeseon Yoo'
  s.homepage       = 'https://reploom.pages.dev'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CryptoKit', 'StoreKit'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
