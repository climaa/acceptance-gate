Feature: Release conversations
  As a reader of the changelog
  I want to open the conversation about a particular release
  so I can read what was said about the version I am looking at.

  Background:
    Given the changelog lists its releases

  Scenario: Nothing is loaded until a reader asks for it
    Then no conversation has been loaded

  Scenario: Opening the conversation for the release on screen
    When I ask for the conversation about the newest release
    Then the conversation about that release is on the page
    And the control offers to take me to it

  Scenario: Asking again goes to the conversation instead of loading it twice
    Given I have opened the conversation about the newest release
    When I ask again
    Then only one conversation has been loaded
    And the control still offers to take me to it

  Scenario: A conversation that cannot be loaded says so in words
    Given the comment service cannot be reached
    When I ask for the conversation about the newest release
    Then the control offers to retry
    And the page states in writing that the conversation could not be loaded

  Scenario: The control is about the release the reader is looking at
    When I scroll to an older release
    Then the control names that release
    And the control offers to load its conversation
