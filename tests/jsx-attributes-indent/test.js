<SomeHighlyConfiguredComponent
  onEnter={this.onEnter}
  onLeave={this.onLeave}
  onChange={this.onChange}
  initialValue={this.state.initialValue}
  bigObject={{
    test: value,
    test2: otherValue,
  }}
  ignoreStuff={true}
>
  <div>and the children go here</div>
  <div>and here too</div>
</SomeHighlyConfiguredComponent>
